import * as fs from "fs";
import * as YAML from "yaml";
import waitForHostConnection from "./wait-for-host-connection";
import JsonClient from "./json_client";

interface Organisation {
    readonly id: string
    readonly name: string
}

interface User {
    readonly id: string
    readonly email: string
}

interface Invite {
    readonly id: string
    readonly email: string
}

interface Group {
    readonly id: string
    readonly name: string
    readonly users: User[]
}

interface Project {
    readonly id: string
    readonly name: string
    readonly environments: Environment[]
}

interface Environment {
    readonly id: string
    readonly name: string
    readonly api_key: string
}

interface UserSpecification {
    readonly email: string
}

interface GroupSpecification {
    readonly name: string
    readonly users: string[]
}

enum ProjectPermission {
    VIEW_PROJECT = "VIEW_PROJECT",
    CREATE_ENVIRONMENT = "CREATE_ENVIRONMENT",
    CREATE_FEATURE = "CREATE_FEATURE",
    DELETE_FEATURE = "DELETE_FEATURE"
}

enum EnvironmentPermission {
    VIEW_ENVIRONMENT = "VIEW_ENVIRONMENT"
}

interface GroupPermission<T extends ProjectPermission | EnvironmentPermission> {
    readonly group: string
    readonly admin: boolean
    readonly permissions: T[]
}

interface EnvironmentSpecification {
    readonly name: string
    readonly groupPermissions: GroupPermission<EnvironmentPermission>[]
}

interface ProjectSpecification {
    readonly name: string
    readonly groupPermissions: GroupPermission<ProjectPermission>[]
    readonly environments: EnvironmentSpecification[]
}

interface OrganisationSpecification {
    readonly name: string
    readonly users: UserSpecification[]
    readonly groups: GroupSpecification[]
    readonly projects: ProjectSpecification[]
}

interface Specification {
    readonly organisations: OrganisationSpecification[]
}

const findOrPush = async <T>(collection: T[], predicate: (item: T) => boolean, factory: () => Promise<T>): Promise<T> => {
    let item = collection.find(predicate);
    if (!item) {
        item = await factory();
        collection.push(item);
    }
    return item;
}

(async (
    hostname: string,
    port: string,
    email: string,
    password: string,
    frontend_url: string,
    specificationPath: string
) => {
    const specification: Specification = YAML.parse(fs.readFileSync(specificationPath, "utf8"));
    await waitForHostConnection(hostname, parseInt(port), 1000);

    const client = new JsonClient({ hostname, port });

    console.log("Creating user account for administrator if it does not already exist...")
    // https://github.com/BulletTrainHQ/bullet-train-api/issues/59
    try {
        await client.get("/api/v1/users/init/");
    } catch (error) {
        console.log(error);
    }

    console.log("Logging in with administrator account...");
    const key: string = (await client.post("/api/v1/auth/login/", { email, password })).key;
    client.setDefaultHeader("Authorization", `Token ${key}`);

    let organisations: Organisation[] = (await client.get("/api/v1/organisations/")).results;
    await Promise.all(specification.organisations.map(async organisationSpecification => {
        const organisation = await findOrPush<Organisation>(
            organisations,
            organisation => organisation.name === organisationSpecification.name,
            async () => await client.post("/api/v1/organisations/", {name: organisationSpecification.name}) as Organisation
        );
        
        const users: User[] = (await client.get(`/api/v1/organisations/${organisation.id}/users/`));
        const invites: Invite[] = (await client.get(`/api/v1/organisations/${organisation.id}/invites/`)).results;
        
        const userSpecifications = organisationSpecification.users.filter(userSpecification =>
            !(
                users.some(user => userSpecification.email === user.email) ||
                invites.some(invite => userSpecification.email === invite.email)
            )
        );

        client.post(
            `/api/v1/organisations/${organisation.id}/invite/`,
            {
                invites: userSpecifications.map(userSpecification => ({ email: userSpecification.email } as Invite)),
                frontend_base_url: `${frontend_url}invite/`
            }
        );

        const groups: Group[] = (await client.get(`/api/v1/organisations/${organisation.id}/groups/`)).results;
        await Promise.all(organisationSpecification.groups.map(async groupSpecification => {
            const group = await findOrPush<Group>(
                groups,
                group => group.name === groupSpecification.name,
                async () => await client.post(`/api/v1/organisations/${organisation.id}/groups/`, { name: groupSpecification.name }) as Group
            );

            const groupUsers = group.users;
            
            const unaddedGroupUsers = users
                .filter(user => groupSpecification.users.includes(user.email)) // user is in group user specification
                .filter(user => !groupUsers.includes(user)) // user not already in group

            if (unaddedGroupUsers.length > 0) {
                client.post(`/api/v1/organisations/${organisation.id}/groups/${group.id}/add-users/`, { user_ids: unaddedGroupUsers.map(unaddedGroupUser => unaddedGroupUser.id) });
            }
        }));

        const projects: Project[] = await client.get(`/api/v1/projects/?organisation=${organisation.id}`);
        await Promise.all(organisationSpecification.projects.map(async projectSpecification => {
            const project = await findOrPush<Project>(
                projects,
                project => project.name === projectSpecification.name,
                async () => await client.post(`/api/v1/projects/`, { name: projectSpecification.name, organisation: organisation.id }) as Project
            );

            projectSpecification.groupPermissions.forEach(groupPermissionSpecification => {
                const group = groups.find(group => group.name === groupPermissionSpecification.group);
                if (group) {
                    client.post(`/api/v1/projects/${project.id}/user-group-permissions/`, { ...groupPermissionSpecification, group: group.id });
                }
            });

            const environments: Environment[] = (await client.get(`/api/v1/environments/?project=${project.id}`)).results;
            await Promise.all(projectSpecification.environments.map(async environmentSpecification => {
                const environment = (
                    environments.find(environment => environment.name === environmentSpecification.name) ||
                    await client.post(`/api/v1/environments/`, { name: environmentSpecification.name, project: project.id }) as Environment
                );
                
                environmentSpecification.groupPermissions.forEach(groupPermissionSpecification => {
                    const group = groups.find(group => group.name === groupPermissionSpecification.group);
                    if (group) {
                        client.post(`/api/v1/environments/${environment.api_key}/user-group-permissions/`, { ...groupPermissionSpecification, group: group.id });
                    }
                });
            }));
        }));
    }));
})(
    process.env.API_HOSTNAME || process.exit(1),
    process.env.API_PORT || process.exit(1),
    process.env.ADMIN_EMAIL || process.exit(1),
    process.env.ADMIN_INITIAL_PASSWORD || process.exit(1),
    process.env.FRONTEND_URL || process.exit(1),
    process.env.SPECIFICATION_PATH || process.exit(1)
)
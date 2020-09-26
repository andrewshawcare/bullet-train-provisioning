#!/bin/bash

export AWS_PAGER=""

source ./pipeline/functions.sh

stack_name='BulletTrain-Repositories'
template_path="./cloudformation-templates/${stack_name}.yaml"
aws cloudformation validate-template --template-body "file://${template_path}"
detect_stack_drift "${stack_name}"
aws cloudformation deploy \
  --no-fail-on-empty-changeset \
  --template-file "${template_path}" \
  --stack-name "${stack_name}"

aws_account_id=''
aws_region=''
version="$(git rev-parse HEAD)"

# Build API
aws ecr get-login-password --region "${aws_region}" | docker login --username AWS --password-stdin "${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com"
docker build --tag bullet-train/api ./api
docker tag bullet-train/api:latest "${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/bullet-train/api:${version}"
docker push "${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/bullet-train/api:${version}"

# Build API provisioner
aws ecr get-login-password --region "${aws_region}" | docker login --username AWS --password-stdin "${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com"
docker build --tag bullet-train/api-provisioner ./api-provisioner
docker tag bullet-train/api-provisioner:latest "${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/bullet-train/api-provisioner:${version}"
docker push "${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/bullet-train/api-provisioner:${version}"
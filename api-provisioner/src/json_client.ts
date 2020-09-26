import * as http from "http";

const waitForMessage = (incomingMessage: http.IncomingMessage): Promise<string> => new Promise(resolve => {
  let message = "";

  incomingMessage.on("data", chunk => {
    message += chunk;
  });

  incomingMessage.on("end", () => resolve(message));
});

const receiveResponse = async (incomingMessage: http.IncomingMessage): Promise<string> => {
  const message = await waitForMessage(incomingMessage);
  
  if (incomingMessage.statusCode && incomingMessage.statusCode >= 400) {
    throw new Error(message);
  }
  
  return message;
}

const sendRequest = (requestOptions: http.RequestOptions, message?: string): Promise<http.IncomingMessage> => new Promise((resolve, reject) => {
  const clientRequest = http.request(requestOptions, resolve);

  clientRequest.on("error", reject);

  if (message) {
    clientRequest.write(message);
  }

  clientRequest.end();
});

interface Serializer<T, U> {
  (source: T): U
}

interface ClientInterface<T, U> {
  readonly messageSerializer: Serializer<U, T>;
  readonly responseSerializer: Serializer<T, U>;
  
  setDefaultHeader(name: string, value: string): ClientInterface<T, U>;
  get(path: string): Promise<U>;
  post(path: string, message: U): Promise<U>
}

export default class JsonClient implements ClientInterface<string, any> {
  messageSerializer = JSON.stringify;
  responseSerializer = JSON.parse;
  defaultRequestOptions: http.RequestOptions = { headers: {} };

  constructor(defaultRequestOptions: http.RequestOptions) {
    this.defaultRequestOptions = { ...this.defaultRequestOptions, ...defaultRequestOptions };
    if (this.defaultRequestOptions.headers) {
      this.defaultRequestOptions.headers["Accept"] = "application/json";
      this.defaultRequestOptions.headers["Content-Type"] = "application/json";
    }
  }

  setDefaultHeader(name: string, value: string): ClientInterface<string, any> {
    if (this.defaultRequestOptions.headers) {
      this.defaultRequestOptions.headers[name] = value;
    }
    return this;
  }

  async get(path: string): Promise<any> {
    const response = await receiveResponse(await sendRequest({
      ...this.defaultRequestOptions,
      ...{
        path,
        method: "GET"
      }
    }));
    return this.responseSerializer(response);
  }

  async post(path: string, message: any): Promise<any> {
    const serializedMessage = this.messageSerializer(message);
    const response = await receiveResponse(await sendRequest({
      ...this.defaultRequestOptions,
      ...{
        path,
        method: "POST",
        headers: {
          ...this.defaultRequestOptions.headers,
          ...{
            "Content-Length": Buffer.byteLength(serializedMessage)
          }
        }
      }
    }, serializedMessage));
    return this.responseSerializer(response);
  }
}
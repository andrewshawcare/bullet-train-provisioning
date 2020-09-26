import * as net from "net";

export default (host: string, port: number, timeoutInMilliseconds: number): Promise<void> => new Promise((resolve) => {
  const socket = new net.Socket();
  
  socket.on("connect", () => {
    console.log(`Connection to ${host}:${port} established.`);
    socket.destroy();
    resolve();
  });
  
  socket.on("error", () => {
    console.log(`Could not connect to ${host}:${port}, waiting ${timeoutInMilliseconds}ms before retrying...`);
    setTimeout(() => socket.connect(port, host), timeoutInMilliseconds);
  });

  console.log(`Waiting for connection to ${host}:${port}...`);
  socket.connect(port, host);
});
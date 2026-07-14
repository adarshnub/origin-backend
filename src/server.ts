import { createServer } from "node:http";
import { clearLine, cursorTo } from "node:readline";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { configureSocket } from "./realtime/socket.js";

function createStartupIndicator(label: string) {
  const frames = ["-", "\\", "|", "/"];
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  if (process.stdout.isTTY) {
    process.stdout.write(`${frames[frame]} ${label}`);
    timer = setInterval(() => {
      frame = (frame + 1) % frames.length;
      cursorTo(process.stdout, 0);
      process.stdout.write(`${frames[frame]} ${label}`);
    }, 90);
  } else {
    console.info(label);
  }

  function stop(message: string, log: (message: string) => void) {
    if (timer) clearInterval(timer);
    if (process.stdout.isTTY) {
      cursorTo(process.stdout, 0);
      clearLine(process.stdout, 0);
    }
    log(message);
  }

  return {
    succeed(message: string) {
      stop(message, console.info);
    },
    fail(message: string) {
      stop(message, console.error);
    },
  };
}

async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(env.PORT, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

const startup = createStartupIndicator(`Starting Origin API on :${env.PORT}`);
const app = createApp();
const server = createServer(app);
const io = await configureSocket(server).catch((error: unknown) => {
  startup.fail("Origin API failed during realtime setup.");
  throw error;
});

app.set("io", io);
await listen(server).then(() => startup.succeed(`Origin API listening on :${env.PORT}`)).catch((error: unknown) => {
  startup.fail(`Origin API failed to listen on :${env.PORT}.`);
  throw error;
});

async function shutdown(signal: string) {
  console.info(`${signal} received, shutting down`);
  io.close();
  await pool.end();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

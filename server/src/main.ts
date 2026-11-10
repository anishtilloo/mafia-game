import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { networkInterfaces } from 'os';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 8004);
  // '::' listens on IPv6 and IPv4 together, so both localhost (::1) and 127.0.0.1 / LAN IPs work.
  // Behind a reverse proxy in production, set HOST=127.0.0.1 so only the proxy can reach the app.
  await app.listen(port, process.env.HOST ?? '::');

  console.log(`\nMafia server running. Open on the host device:`);
  console.log(`  http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  http://${net.address}:${port}   (phones on the same Wi-Fi)`);
      }
    }
  }
}
bootstrap();

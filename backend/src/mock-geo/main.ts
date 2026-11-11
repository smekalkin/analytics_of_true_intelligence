import { MockGeoServer } from './mock-geo-server';

const port = Number(process.env.MOCK_GEO_PORT ?? 4010);
const server = new MockGeoServer({
  apiKey: process.env.MOCK_GEO_API_KEY ?? 'mock-geo-key',
  failureRate: Number(process.env.MOCK_GEO_FAILURE_RATE ?? 0.2),
  latencyMs: [100, Number(process.env.MOCK_GEO_MAX_LATENCY_MS ?? 600)],
});

server.listen(port, '0.0.0.0').then((p) => console.log(`Mock Geo API: http://localhost:${p}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close().then(() => process.exit(0)));
}

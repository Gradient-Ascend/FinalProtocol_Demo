import { createServer } from 'vite'

const server = await createServer({
  server: { host: '127.0.0.1', port: 7101, strictPort: true },
})
try {
  await server.listen()
  const response = await fetch('http://127.0.0.1:7101/')
  const html = await response.text()
  if (!response.ok || !html.includes('<div id="root"></div>')) {
    throw new Error(`Preview verification failed with HTTP ${response.status}`)
  }
  console.log('Preview verified at http://127.0.0.1:7101/')
} finally {
  await server.close()
}

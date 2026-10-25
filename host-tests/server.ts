import { randomInt } from 'node:crypto'
import type { Server } from 'node:http'

// Windows can assign a browser-blocked port to listen(0). The dynamic/private
// range avoids Chromium's restricted ports without allowing unsafe-port flags.
export async function listenSafe(server: Server) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const failed = (error: Error) => { server.off('listening', ready); reject(error) }
        const ready = () => { server.off('error', failed); resolve() }
        server.once('error', failed)
        server.once('listening', ready)
        server.listen(randomInt(49152, 65536), '127.0.0.1')
      })
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
    }
  }
  throw new Error('Could not reserve a safe browser fixture port')
}

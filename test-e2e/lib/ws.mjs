// Minimal RFC 6455 WebSocket client — just enough for Chrome DevTools Protocol.
// The workspace has no `ws` package and no Playwright, so this speaks the wire
// protocol over node:net: handshake, masked client frames, unmasked server
// frames, fragmentation, and ping/pong keepalive.
import net from 'node:net';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const OP_CONT = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

export class WebSocketClient extends EventEmitter {
  #socket = null;
  #buf = Buffer.alloc(0);
  #fragOp = null;
  #fragParts = [];
  #closed = false;

  constructor(url, { timeoutMs = 15000 } = {}) {
    super();
    this.url = new URL(url);
    this.timeoutMs = timeoutMs;
  }

  connect() {
    const { hostname, port, pathname, search } = this.url;
    const key = crypto.randomBytes(16).toString('base64');
    const path = (pathname || '/') + (search || '');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`websocket connect timeout after ${this.timeoutMs}ms`));
        this.#socket?.destroy();
      }, this.timeoutMs);

      const socket = net.connect(Number(port || 80), hostname, () => {
        socket.write(
          [
            `GET ${path} HTTP/1.1`,
            `Host: ${hostname}:${port}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${key}`,
            'Sec-WebSocket-Version: 13',
            'User-Agent: dsh-e2e-probe',
            '',
            '',
          ].join('\r\n'),
        );
      });
      this.#socket = socket;
      socket.setNoDelay(true);

      let handshakeDone = false;
      let head = Buffer.alloc(0);

      const onData = (chunk) => {
        if (handshakeDone) {
          this.#onBytes(chunk);
          return;
        }
        head = Buffer.concat([head, chunk]);
        const end = head.indexOf('\r\n\r\n');
        if (end < 0) return;
        const header = head.subarray(0, end).toString('latin1');
        const rest = head.subarray(end + 4);
        const status = header.split('\r\n')[0];
        if (!/^HTTP\/1\.1 101/.test(status)) {
          clearTimeout(timer);
          socket.destroy();
          reject(new Error(`websocket handshake failed: ${status}`));
          return;
        }
        const expect = crypto
          .createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');
        if (!header.toLowerCase().includes(expect.toLowerCase())) {
          clearTimeout(timer);
          socket.destroy();
          reject(new Error('websocket handshake failed: bad Sec-WebSocket-Accept'));
          return;
        }
        handshakeDone = true;
        clearTimeout(timer);
        resolve(this);
        if (rest.length) this.#onBytes(rest);
      };

      socket.on('data', onData);
      socket.on('error', (err) => {
        clearTimeout(timer);
        if (!handshakeDone) reject(err);
        this.emit('error', err);
      });
      socket.on('close', () => {
        this.#closed = true;
        clearTimeout(timer);
        if (!handshakeDone) reject(new Error('websocket closed during handshake'));
        this.emit('close');
      });
    });
  }

  #onBytes(chunk) {
    this.#buf = Buffer.concat([this.#buf, chunk]);
    for (;;) {
      const buf = this.#buf;
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < offset + 2) return;
        len = buf.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (buf.length < offset + 8) return;
        const big = buf.readBigUInt64BE(offset);
        len = Number(big);
        offset += 8;
      }
      let maskKey = null;
      if (masked) {
        if (buf.length < offset + 4) return;
        maskKey = buf.subarray(offset, offset + 4);
        offset += 4;
      }
      if (buf.length < offset + len) return;
      let payload = buf.subarray(offset, offset + len);
      if (maskKey) {
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
        payload = out;
      }
      this.#buf = buf.subarray(offset + len);
      this.#handleFrame(fin, opcode, payload);
    }
  }

  #handleFrame(fin, opcode, payload) {
    if (opcode === OP_PING) {
      this.#writeFrame(OP_PONG, payload);
      return;
    }
    if (opcode === OP_PONG) return;
    if (opcode === OP_CLOSE) {
      this.close();
      return;
    }
    if (opcode === OP_CONT) {
      this.#fragParts.push(payload);
    } else {
      this.#fragParts = [payload];
      this.#fragOp = opcode;
    }
    if (!fin) return;
    const full = Buffer.concat(this.#fragParts);
    this.#fragParts = [];
    const op = this.#fragOp;
    this.#fragOp = null;
    if (op === OP_TEXT) this.emit('message', full.toString('utf8'));
    else if (op === OP_BINARY) this.emit('binary', full);
  }

  #writeFrame(opcode, payload) {
    if (this.#closed || !this.#socket || this.#socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(6);
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(8);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(14);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    const mask = crypto.randomBytes(4);
    mask.copy(header, header.length - 4);
    const body = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) body[i] = payload[i] ^ mask[i & 3];
    this.#socket.write(Buffer.concat([header, body]));
  }

  send(text) {
    this.#writeFrame(OP_TEXT, Buffer.from(text, 'utf8'));
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#writeFrame(OP_CLOSE, Buffer.alloc(0));
    } catch {}
    this.#socket?.end();
    this.#socket?.destroy();
  }
}

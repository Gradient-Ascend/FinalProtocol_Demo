// Renders the two inputs of the bake from the game's own code, so the models
// are shown exactly what the opening sequence draws and plays:
//
//   out/cg-image.pgm, out/cg-image.png   the hand, 224 x 224, 8-bit grey
//   out/cg-voice.wav                     the chant, 24 kHz mono, 16-bit PCM
//
// Run with the project's node (v24 strips the TypeScript types on import):
//   "$NODE" scripts/bake/render-inputs.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { CG_IMAGE_SIZE, renderHand } from '../../src/cinematic/cg-image.ts'
import { renderVoice } from '../../src/cinematic/cg-voice.ts'

const out = join(dirname(fileURLToPath(import.meta.url)), 'out')
mkdirSync(out, { recursive: true })

// --- image ---
const size = CG_IMAGE_SIZE
const grey = renderHand(size)
const bytes = Buffer.alloc(size * size)
for (let i = 0; i < grey.length; i++) bytes[i] = Math.round(Math.min(1, Math.max(0, grey[i])) * 255)
writeFileSync(join(out, 'cg-image.pgm'), Buffer.concat([Buffer.from(`P5\n${size} ${size}\n255\n`, 'ascii'), bytes]))

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = buf => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const len = Buffer.alloc(4), sum = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const header = Buffer.alloc(13)
header.writeUInt32BE(size, 0)
header.writeUInt32BE(size, 4)
header.set([8, 0, 0, 0, 0], 8)                       // 8-bit greyscale
const rows = Buffer.alloc(size * (size + 1))         // each row starts with filter byte 0
for (let y = 0; y < size; y++) bytes.copy(rows, y * (size + 1) + 1, y * size, (y + 1) * size)
writeFileSync(join(out, 'cg-image.png'), Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
]))

// --- voice ---
const voice = renderVoice()
const pcm = Buffer.alloc(voice.samples.length * 2)
let peak = 0
for (let i = 0; i < voice.samples.length; i++) {
  const s = Math.min(1, Math.max(-1, voice.samples[i]))
  peak = Math.max(peak, Math.abs(s))
  pcm.writeInt16LE(Math.round(s * 32767), i * 2)
}
const wav = Buffer.alloc(44)
wav.write('RIFF', 0, 'ascii'); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVEfmt ', 8, 'ascii')
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(voice.sampleRate, 24); wav.writeUInt32LE(voice.sampleRate * 2, 28)
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36, 'ascii'); wav.writeUInt32LE(pcm.length, 40)
writeFileSync(join(out, 'cg-voice.wav'), Buffer.concat([wav, pcm]))

console.log(`cg-image: ${size} x ${size} -> ${join(out, 'cg-image.pgm')} (+ .png)`)
console.log(`cg-voice: ${(voice.samples.length / voice.sampleRate).toFixed(2)} s at ${voice.sampleRate} Hz, peak ${peak.toFixed(3)}, voices enter at ${voice.entries.join(', ')} s -> ${join(out, 'cg-voice.wav')}`)

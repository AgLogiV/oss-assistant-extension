import fs from "node:fs";
import zlib from "node:zlib";

const path = process.argv[2];
const buf = fs.readFileSync(path);

// Find End of Central Directory
let eocd = -1;
for (let i = buf.length - 22; i >= 0; i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error("EOCD not found");
const cdCount = buf.readUInt16LE(eocd + 10);
let cdOffset = buf.readUInt32LE(eocd + 16);

const entries = {};
let p = cdOffset;
for (let n = 0; n < cdCount; n++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) break;
  const method = buf.readUInt16LE(p + 10);
  const compSize = buf.readUInt32LE(p + 20);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const localOffset = buf.readUInt32LE(p + 42);
  const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
  entries[name] = { method, compSize, localOffset };
  p += 46 + nameLen + extraLen + commentLen;
}

function readEntry(name) {
  const e = entries[name];
  if (!e) throw new Error("no entry " + name);
  const lp = e.localOffset;
  const nameLen = buf.readUInt16LE(lp + 26);
  const extraLen = buf.readUInt16LE(lp + 28);
  const dataStart = lp + 30 + nameLen + extraLen;
  const raw = buf.slice(dataStart, dataStart + e.compSize);
  if (e.method === 0) return raw;
  return zlib.inflateRawSync(raw);
}

let xml = readEntry("word/document.xml").toString("utf8");
xml = xml.replace(/<\/w:p>/g, "\n");
xml = xml.replace(/<w:tab\/>/g, "\t");
xml = xml.replace(/<[^>]+>/g, "");
xml = xml.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
console.log(xml);

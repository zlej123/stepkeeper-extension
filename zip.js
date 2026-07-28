// 최소 ZIP 작성기 (STORE, 무압축) — 문서·이미지·분석 JSON을 파일 하나로 묶는다 (외부 리뷰 #9).
// 예전에는 document.md와 vg-*.jpg를 낱개로 내려받아 다운로드 폴더에 흩어졌다.
// 외부 라이브러리 없이 ZIP 스펙의 최소 부분집합만 구현: local header + central directory + EOCD.

const STEPKEEPER_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function stepkeeperCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = STEPKEEPER_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/// files: [{ name: string, data: Uint8Array | string }] → ZIP Blob.
/// 파일명은 UTF-8 플래그(bit 11)로 기록한다 (한국어·일본어 제목 대응).
function stepkeeperZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (v) => new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
  const u32 = (v) => new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);

  for (const file of files) {
    const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
    const name = encoder.encode(file.name);
    const crc = stepkeeperCrc32(data);
    // local file header: sig, version 20, flags(UTF-8), method 0(STORE), time/date 0,
    // crc, 압축/원본 크기(동일), 이름 길이, extra 0
    const header = [u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
                    u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)];
    central.push({ name, crc, size: data.length, offset });
    for (const part of [...header, name, data]) { chunks.push(part); offset += part.length; }
  }

  const centralStart = offset;
  for (const entry of central) {
    const record = [u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
                    u32(entry.crc), u32(entry.size), u32(entry.size), u16(entry.name.length),
                    u16(0), u16(0), u16(0), u16(0), u32(0), u32(entry.offset)];
    for (const part of [...record, entry.name]) { chunks.push(part); offset += part.length; }
  }
  chunks.push(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
              u32(offset - centralStart), u32(centralStart), u16(0));
  return new Blob(chunks, { type: "application/zip" });
}

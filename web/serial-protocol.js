export function createFramePacket(seq, rgb) {
  const packet = new Uint8Array(2 + 2 + 2 + rgb.length);
  packet[0] = 78;
  packet[1] = 80;
  packet[2] = rgb.length & 0xff;
  packet[3] = (rgb.length >> 8) & 0xff;
  packet[4] = seq & 0xff;
  packet[5] = (seq >> 8) & 0xff;
  packet.set(rgb, 6);
  return packet;
}

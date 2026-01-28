import { BAUD, POST_OPEN_DELAY_MS } from "./constants.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSerial({ dom, state, setStatus }) {
  async function connect() {
    try {
      if (!("serial" in navigator)) {
        alert("WebSerial未対応です。Chrome系で開いてください。");
        return;
      }

      const granted = await navigator.serial.getPorts();
      if (granted.length === 1) {
        state.port = granted[0];
      } else {
        state.port = await navigator.serial.requestPort();
      }
      await state.port.open({ baudRate: BAUD });
      state.writer = state.port.writable.getWriter();

      dom.btnConnect.disabled = true;
      dom.btnDisconnect.disabled = false;
      dom.btnStart.disabled = true;
      dom.btnStop.disabled = true;

      setStatus("connected", `fps: ${dom.fps.value}  seq: ${String(state.seq).padStart(4, "0")}`);

      await sleep(POST_OPEN_DELAY_MS);
      dom.btnStart.disabled = false;
    } catch (e) {
      console.error(e);
      state.port = null;
      state.writer = null;
      setStatus("connect failed");
    }
  }

  async function disconnect() {
    try {
      state.stop();
      if (state.writer) { state.writer.releaseLock(); state.writer = null; }
      if (state.port) { await state.port.close(); state.port = null; }
    } catch (e) {
      console.error(e);
    } finally {
      dom.btnConnect.disabled = false;
      dom.btnDisconnect.disabled = true;
      dom.btnStart.disabled = true;
      dom.btnStop.disabled = true;
      setStatus("idle", "fps: --  seq: ----");
    }
  }

  async function sendFrame(rgb) {
    if (!state.writer) return;
    if (state.sendInFlight) { state.drops++; dom.dropInfo.textContent = `drops: ${state.drops}`; return; }
    state.sendInFlight = true;

    const packet = new Uint8Array(2 + 2 + 2 + rgb.length);
    packet[0] = 78;
    packet[1] = 80;
    packet[2] = rgb.length & 0xff;
    packet[3] = (rgb.length >> 8) & 0xff;
    packet[4] = state.seq & 0xff;
    packet[5] = (state.seq >> 8) & 0xff;
    packet.set(rgb, 6);

    state.seq = (state.seq + 1) & 0xffff;

    try {
      await state.writer.write(packet);
    } catch (e) {
      console.error(e);
      setStatus("send error");
      state.stop();
    } finally {
      state.sendInFlight = false;
    }
  }

  dom.btnConnect.addEventListener("click", connect);
  dom.btnDisconnect.addEventListener("click", disconnect);

  return { connect, disconnect, sendFrame };
}

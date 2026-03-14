export function createSceneBusReceiver(options) {
  const state = {
    socket: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    stopped: true,
    statusHandlers: new Set(),
    eventHandlers: new Set(),
    lastError: null,
    lastSeq: 0,
    seenSeqs: new Set(),
  };

  function emitStatus(connected, error = null) {
    state.lastError = error;
    for (const handler of state.statusHandlers) {
      handler({ connected, error });
    }
  }

  function connect() {
    if (state.stopped) return;

    try {
      const socket = new WebSocket(options.wsUrl);
      state.socket = socket;

      socket.addEventListener("open", () => {
        state.reconnectAttempt = 0;
        const join = {
          type: "join",
          authToken: options.authToken,
          nodeId: options.nodeId,
          sourceApp: options.sourceApp,
          room: options.room,
          groups: options.groups,
          lastSeq: state.lastSeq,
        };
        socket.send(JSON.stringify(join));
        emitStatus(true, null);
      });

      socket.addEventListener("message", (event) => {
        let parsed;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          emitStatus(false, "scene-bus message parse failed");
          return;
        }

        if (parsed?.type !== "event" || !parsed.envelope) return;
        const seq = Number(parsed.envelope.seq);
        if (Number.isFinite(seq)) {
          if (state.seenSeqs.has(seq)) {
            sendAck(seq);
            return;
          }
          state.seenSeqs.add(seq);
          state.lastSeq = Math.max(state.lastSeq, seq);
          if (state.seenSeqs.size > 2000) {
            const retained = Array.from(state.seenSeqs).slice(-500);
            state.seenSeqs = new Set(retained);
          }
          sendAck(seq);
        }
        for (const handler of state.eventHandlers) {
          handler(parsed.envelope, Boolean(parsed.replay));
        }
      });

      socket.addEventListener("close", () => {
        state.socket = null;
        if (!state.stopped) {
          const error = `scene-bus disconnected: ${options.wsUrl}`;
          emitStatus(false, error);
          scheduleReconnect();
        }
      });

      socket.addEventListener("error", () => {
        emitStatus(false, `scene-bus connection error: ${options.wsUrl}`);
      });
    } catch (error) {
      emitStatus(false, error instanceof Error ? error.message : "scene-bus connect failed");
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (state.reconnectTimer !== null || state.stopped) return;

    const delay = Math.min(5000, 500 * 2 ** state.reconnectAttempt);
    state.reconnectAttempt += 1;

    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, delay);
  }

  function sendAck(seq) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    state.socket.send(JSON.stringify({ type: "ack", seq }));
  }

  return {
    start() {
      if (state.socket) return;
      state.stopped = false;
      connect();
    },
    stop() {
      state.stopped = true;
      if (state.reconnectTimer !== null) {
        window.clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      if (state.socket) {
        state.socket.close(1000, "webledcontrol_stop");
        state.socket = null;
      }
      emitStatus(false, state.lastError);
    },
    onStatus(handler) {
      state.statusHandlers.add(handler);
      handler({ connected: state.socket?.readyState === WebSocket.OPEN, error: state.lastError });
      return () => state.statusHandlers.delete(handler);
    },
    onEvent(handler) {
      state.eventHandlers.add(handler);
      return () => state.eventHandlers.delete(handler);
    },
  };
}

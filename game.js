
(() => {
  const SIZE = 10;
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);

  let board;
  let turn = "white";
  let selected = null;
  let legalMoves = [];
  let forcedPiece = null;
  let gameOver = false;

  let socket = null;
  let roomCode = "";
  let myColor = null;
  let online = false;

  const geo = {
    cx: 0,
    top: 0,
    bottom: 0,
    farWidth: 0,
    nearWidth: 0
  };

  function initialBoard() {
    const b = Array.from(
      { length: SIZE },
      () => Array(SIZE).fill(null)
    );

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 === 1) {
          b[r][c] = { color: "black", king: false };
        }
      }
    }

    for (let r = 6; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 === 1) {
          b[r][c] = { color: "white", king: false };
        }
      }
    }

    return b;
  }

  // Perspective projection:
  // narrow at the opponent's side, wider at the player's side.
  function project(r, c) {
    const t = r / SIZE;
    const width =
      geo.farWidth +
      (geo.nearWidth - geo.farWidth) * t;

    return {
      x: geo.cx + (c / SIZE - 0.5) * width,
      y: geo.top + t * (geo.bottom - geo.top)
    };
  }

  function squareCorners(r, c) {
    return [
      project(r, c),
      project(r, c + 1),
      project(r + 1, c + 1),
      project(r + 1, c)
    ];
  }

  function squareCenter(r, c) {
    const q = squareCorners(r, c);

    return {
      x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
      y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4
    };
  }

  function resize() {
    const width = Math.max(
      300,
      Math.min(canvas.parentElement.clientWidth, 850)
    );

    const height = width * 0.77;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    geo.cx = width / 2;
    geo.top = height * 0.12;
    geo.bottom = height * 0.88;
    geo.farWidth = width * 0.43;
    geo.nearWidth = width * 0.91;
  }

  function polygon(points, fill, stroke = null) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawTable() {
    const corners = [
      project(0, 0),
      project(0, SIZE),
      project(SIZE, SIZE),
      project(SIZE, 0)
    ];

    const rim = corners.map(p => ({
      x: p.x,
      y: p.y + 5
    }));

    ctx.save();
    ctx.shadowColor = "#000b";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 16;

    polygon(
      rim.map((p, i) => ({
        x: p.x + (i === 1 || i === 2 ? 10 : -10),
        y: p.y + (i >= 2 ? 15 : -5)
      })),
      "#392018"
    );

    ctx.restore();

    polygon(corners, "#b77943", "#e4b478");

    // Warm wooden texture lines along the frame.
    for (let i = 0; i < 7; i++) {
      const y = geo.top - 6 + i * 3;

      ctx.beginPath();
      ctx.moveTo(geo.cx - geo.farWidth / 2 - 7, y);
      ctx.lineTo(geo.cx + geo.farWidth / 2 + 7, y);
      ctx.strokeStyle = "#f0c58a22";
      ctx.stroke();
    }
  }

  function drawBoard() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const corners = squareCorners(r, c);
        const dark = (r + c) % 2 === 1;

        const gradient = ctx.createLinearGradient(
          corners[0].x,
          corners[0].y,
          corners[2].x,
          corners[2].y
        );

        if (dark) {
          gradient.addColorStop(0, "#c38a59");
          gradient.addColorStop(1, "#89512f");
        } else {
          gradient.addColorStop(0, "#f8e4c1");
          gradient.addColorStop(1, "#d9b987");
        }

        polygon(corners, gradient, "#795033");

        if (
          selected &&
          selected.r === r &&
          selected.c === c
        ) {
          polygon(corners, "#48df9b66");
        }

        const isTarget = legalMoves.some(
          m => m.to.r === r && m.to.c === c
        );

        if (isTarget) {
          const p = squareCenter(r, c);

          ctx.beginPath();
          ctx.ellipse(
            p.x,
            p.y,
            (geo.nearWidth / SIZE) * 0.20,
            ((geo.bottom - geo.top) / SIZE) * 0.18,
            0,
            0,
            Math.PI * 2
          );

          ctx.fillStyle = "#55e9a5";
          ctx.fill();
          ctx.strokeStyle = "#e9fff3";
          ctx.stroke();
        }

        if (board[r][c]) {
          drawPiece(
            squareCenter(r, c),
            board[r][c],
            selected?.r === r && selected?.c === c,
            r
          );
        }
      }
    }
  }

  function drawPiece(point, piece, isSelected, row) {
    const depth = row / (SIZE - 1);
    const radius = (geo.nearWidth / SIZE) *
      (0.24 + depth * 0.045);

    const rx = radius;
    const ry = radius * 0.38;
    const x = point.x;
    const y = point.y;

    // Contact shadow.
    ctx.beginPath();
    ctx.ellipse(
      x + 2,
      y + ry * 0.8,
      rx * 1.05,
      ry * 1.05,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "#0007";
    ctx.fill();

    // Raised body.
    ctx.beginPath();
    ctx.ellipse(
      x,
      y - ry * 0.35,
      rx,
      ry,
      0,
      0,
      Math.PI * 2
    );

    const gradient = ctx.createLinearGradient(
      x - rx,
      y - ry,
      x + rx,
      y + ry
    );

    if (piece.color === "white") {
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.55, "#e0e6ed");
      gradient.addColorStop(1, "#98a7ba");
    } else {
      gradient.addColorStop(0, "#697c96");
      gradient.addColorStop(0.45, "#303e53");
      gradient.addColorStop(1, "#101723");
    }

    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle =
      piece.color === "white" ? "#aab8c8" : "#090e16";

    ctx.lineWidth = 2;
    ctx.stroke();

    // Top shine.
    ctx.beginPath();
    ctx.ellipse(
      x,
      y - ry * 0.47,
      rx * 0.72,
      ry * 0.65,
      0,
      Math.PI,
      Math.PI * 2
    );

    ctx.strokeStyle =
      piece.color === "white" ? "#ffffff" : "#91a3bd";

    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (piece.king) {
      ctx.fillStyle = "#f7c96f";
      ctx.font = `bold ${Math.max(12, rx * 0.9)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("♛", x, y - ry * 0.25);
    }

    if (isSelected) {
      ctx.beginPath();
      ctx.ellipse(
        x,
        y - ry * 0.35,
        rx + 5,
        ry + 5,
        0,
        0,
        Math.PI * 2
      );

      ctx.strokeStyle = "#69ffb3";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function render() {
    resize();

    ctx.clearRect(
      0,
      0,
      canvas.clientWidth,
      canvas.clientHeight
    );

    drawTable();
    drawBoard();
    updateStats();
  }

  function inside(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function directions(piece) {
    if (piece.king) {
      return [
        [-1, -1], [-1, 1],
        [1, -1], [1, 1]
      ];
    }

    return piece.color === "white"
      ? [[-1, -1], [-1, 1]]
      : [[1, -1], [1, 1]];
  }

  function capturesFrom(r, c, b = board) {
    const piece = b[r][c];
    if (!piece) return [];

    const result = [];

    for (const [dr, dc] of [
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ]) {
      if (piece.king) {
        let rr = r + dr;
        let cc = c + dc;

        while (inside(rr, cc) && !b[rr][cc]) {
          rr += dr;
          cc += dc;
        }

        if (
          !inside(rr, cc) ||
          b[rr][cc].color === piece.color
        ) continue;

        const victim = { r: rr, c: cc };
        rr += dr;
        cc += dc;

        while (inside(rr, cc) && !b[rr][cc]) {
          result.push({
            from: { r, c },
            to: { r: rr, c: cc },
            capture: victim
          });

          rr += dr;
          cc += dc;
        }
      } else {
        const mr = r + dr;
        const mc = c + dc;
        const tr = r + 2 * dr;
        const tc = c + 2 * dc;

        if (
          inside(mr, mc) &&
          b[mr][mc] &&
          b[mr][mc].color !== piece.color &&
          inside(tr, tc) &&
          !b[tr][tc]
        ) {
          result.push({
            from: { r, c },
            to: { r: tr, c: tc },
            capture: { r: mr, c: mc }
          });
        }
      }
    }

    return result;
  }

  function allCaptures(color = turn, b = board) {
    let result = [];

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (b[r][c]?.color === color) {
          result.push(...capturesFrom(r, c, b));
        }
      }
    }

    return result;
  }

  function simpleMovesFrom(r, c, b = board) {
    const piece = b[r][c];
    if (!piece) return [];

    const result = [];

    for (const [dr, dc] of directions(piece)) {
      let rr = r + dr;
      let cc = c + dc;

      if (piece.king) {
        while (inside(rr, cc) && !b[rr][cc]) {
          result.push({
            from: { r, c },
            to: { r: rr, c: cc }
          });

          rr += dr;
          cc += dc;
        }
      } else if (inside(rr, cc) && !b[rr][cc]) {
        result.push({
          from: { r, c },
          to: { r: rr, c: cc }
        });
      }
    }

    return result;
  }

  function captureDepth(r, c, b, depth = 0) {
    if (depth > 20) return 0;

    const captures = capturesFrom(r, c, b);
    let best = 0;

    for (const m of captures) {
      const copy = b.map(row => row.slice());
      const piece = { ...copy[r][c] };

      copy[r][c] = null;
      copy[m.capture.r][m.capture.c] = null;
      copy[m.to.r][m.to.c] = piece;

      best = Math.max(
        best,
        1 + captureDepth(m.to.r, m.to.c, copy, depth + 1)
      );
    }

    return best;
  }

  function depthAfterMove(m) {
    const copy = board.map(row => row.slice());
    const piece = { ...copy[m.from.r][m.from.c] };

    copy[m.from.r][m.from.c] = null;
    copy[m.capture.r][m.capture.c] = null;
    copy[m.to.r][m.to.c] = piece;

    return 1 + captureDepth(m.to.r, m.to.c, copy);
  }

  function legalFor(r, c) {
    const piece = board[r][c];

    if (
      !piece ||
      piece.color !== turn ||
      (forcedPiece &&
        (forcedPiece.r !== r || forcedPiece.c !== c))
    ) return [];

    const captures = allCaptures();

    if (captures.length) {
      const max = Math.max(...captures.map(depthAfterMove));

      return captures.filter(m =>
        m.from.r === r &&
        m.from.c === c &&
        depthAfterMove(m) === max
      );
    }

    return simpleMovesFrom(r, c);
  }

  function updateStats() {
    for (const color of ["white", "black"]) {
      const pieces = board.flat().filter(
        p => p && p.color === color
      );

      $(color + "Count").textContent = pieces.length;
      $(color + "Kings").textContent =
        pieces.filter(p => p.king).length;

      const tag = $(color + "Turn");
      tag.classList.toggle(
        "active",
        turn === color && !gameOver
      );

      tag.textContent = gameOver
        ? (turn === color ? "Winner" : "Game over")
        : (turn === color ? "Your turn" : "Waiting");
    }
  }

  function checkWinner() {
    const count = board.flat().filter(
      p => p && p.color === turn
    ).length;

    const canMove =
      allCaptures(turn).length > 0 ||
      board.some((row, r) =>
        row.some((p, c) =>
          p?.color === turn &&
          simpleMovesFrom(r, c).length > 0
        )
      );

    if (!count || !canMove) {
      gameOver = true;
      $("message").textContent =
        (turn === "white" ? "Black" : "White") + " wins!";
    } else {
      $("message").textContent =
        turn === "white" ? "White to move." : "Black to move.";
    }
  }

  function applyMove(m, fromServer = false) {
    const piece = board[m.from.r][m.from.c];
    if (!piece) return;

    board[m.from.r][m.from.c] = null;

    if (m.capture) {
      board[m.capture.r][m.capture.c] = null;
    }

    board[m.to.r][m.to.c] = piece;

    const crowned =
      (piece.color === "white" && m.to.r === 0) ||
      (piece.color === "black" && m.to.r === 9);

    if (crowned) piece.king = true;

    if (
      m.capture &&
      !crowned &&
      capturesFrom(m.to.r, m.to.c).length
    ) {
      forcedPiece = { r: m.to.r, c: m.to.c };
      selected = forcedPiece;
      legalMoves = legalFor(m.to.r, m.to.c);

      $("message").textContent =
        "Continue capturing with the same piece.";

      if (online && !fromServer) {
        socket.emit("move", { roomCode, move: m });
      }

      render();
      return;
    }

    forcedPiece = null;
    selected = null;
    legalMoves = [];
    turn = turn === "white" ? "black" : "white";

    if (online && !fromServer) {
      socket.emit("move", { roomCode, move: m });
    }

    checkWinner();
    render();
  }

  function hitTest(x, y) {
    if (y < geo.top || y > geo.bottom) return null;

    const r = Math.floor(
      ((y - geo.top) / (geo.bottom - geo.top)) * SIZE
    );

    if (!inside(r, 0)) return null;

    const t = (r + 0.5) / SIZE;
    const width =
      geo.farWidth +
      (geo.nearWidth - geo.farWidth) * t;

    const c = Math.floor(
      ((x - (geo.cx - width / 2)) / width) * SIZE
    );

    return inside(r, c) ? { r, c } : null;
  }

  canvas.addEventListener("click", e => {
    if (gameOver) return;

    if (online && myColor !== turn) {
      $("message").textContent = "Wait for your turn.";
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const sq = hitTest(
      e.clientX - rect.left,
      e.clientY - rect.top
    );

    if (!sq) return;

    const move = selected && legalMoves.find(
      m => m.to.r === sq.r && m.to.c === sq.c
    );

    if (move) {
      applyMove(move);
      return;
    }

    if (board[sq.r][sq.c]?.color === turn) {
      selected = sq;
      legalMoves = legalFor(sq.r, sq.c);

      $("message").textContent = legalMoves.length
        ? "Choose a highlighted square."
        : "No legal move for this piece.";
    } else if (!forcedPiece) {
      selected = null;
      legalMoves = [];
      $("message").textContent = "Select one of your pieces.";
    }

    render();
  });

  function resetGame() {
    board = initialBoard();
    turn = "white";
    selected = null;
    legalMoves = [];
    forcedPiece = null;
    gameOver = false;

    $("message").textContent =
      "White moves first. Select a piece.";

    render();
  }

  $("reset").addEventListener("click", () => {
    if (online) {
      $("message").textContent =
        "Create a new room to reset an online game.";
      return;
    }

    resetGame();
  });

  function setConnection(isOnline, text) {
    online = isOnline;
    $("connectionStatus").textContent = text;
    $("connectionDot").classList.toggle("online", isOnline);
  }

  if (typeof window.io === "function") {
    socket = io();

    socket.on("connect", () =>
      setConnection(true, "Server connected")
    );

    socket.on("disconnect", () =>
      setConnection(false, "Disconnected")
    );

    socket.on("roomJoined", data => {
      roomCode = data.roomCode;
      myColor = data.color;
      board = data.board;
      turn = data.turn;
      forcedPiece = null;
      selected = null;
      legalMoves = [];
      $("room").value = roomCode;
      $("message").textContent =
        "Joined " + roomCode + " as " + myColor + ".";
      render();
    });

    socket.on("state", data => {
      board = data.board;
      turn = data.turn;
      forcedPiece = data.forced || null;
      gameOver = !!data.gameOver;
      selected = null;
      legalMoves = [];
      $("message").textContent =
        data.message || turn + " to move.";
      render();
    });

    socket.on("roomError", msg => {
      $("message").textContent = msg;
    });
  } else {
    setConnection(false, "Local mode");
  }

  $("join").addEventListener("click", () => {
    const code = (
      $("room").value.trim() ||
      Math.random().toString(36).slice(2, 8)
    ).toUpperCase();

    $("room").value = code;

    if (!socket) {
      $("message").textContent =
        "Start the Node.js server with npm start first.";
      return;
    }

    socket.emit("joinRoom", { roomCode: code });
  });

  window.addEventListener("resize", render);

  resetGame();
})();

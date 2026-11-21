const MOVES = 'udlr';
const MAX_ROOM_STATES = 200_000;

function parse(level) {
  const lines = level.trimEnd().split(/\r?\n/);
  const stride = Math.max(...lines.map((line) => line.length)) + 2;
  const size = stride * (lines.length + 2);
  const floor = new Uint8Array(size);
  const goal = new Uint8Array(size);
  const boxes = [];
  let player = -1;

  for (const [y, row] of lines.entries()) {
    for (const [x, tile] of [...row].entries()) {
      const cell = (y + 1) * stride + x + 1;
      if (' .$*@+'.includes(tile)) floor[cell] = 1;
      if ('.*+'.includes(tile)) goal[cell] = 1;
      if ('$*'.includes(tile)) boxes.push(cell);
      if ('@+'.includes(tile)) player = cell;
    }
  }

  return { floor, goal, boxes, player, stride, offsets: [-stride, stride, -1, 1] };
}

function findRooms(board) {
  const { floor, boxes, player, stride, offsets } = board;
  const hallway = Math.floor(player / stride);
  const assigned = new Uint8Array(floor.length);
  const rooms = [];
  for (const first of boxes) {
    if (assigned[first]) continue;
    const cells = [first];
    assigned[first] = 1;
    for (let i = 0; i < cells.length; i++) {
      for (const delta of offsets) {
        const next = cells[i] + delta;
        if (floor[next] && !assigned[next] && Math.floor(next / stride) !== hallway) {
          assigned[next] = 1;
          cells.push(next);
        }
      }
    }
    const inside = new Uint8Array(floor.length);
    for (const cell of cells) inside[cell] = 1;
    rooms.push({ inside, boxes: boxes.filter((cell) => inside[cell]) });
  }
  return rooms;
}

function usefulBoxCells(board, inside) {
  const targets = [];
  const reachable = new Uint8Array(inside.length);
  for (let cell = 0; cell < inside.length; cell++) {
    if (inside[cell] && board.goal[cell]) {
      targets.push(cell);
      reachable[cell] = 1;
    }
  }
  for (let i = 0; i < targets.length; i++) {
    for (const delta of board.offsets) {
      const before = targets[i] - delta;
      if (inside[before] && board.floor[before - delta] && !reachable[before]) {
        reachable[before] = 1;
        targets.push(before);
      }
    }
  }
  return reachable;
}

function shortestPushes(board, room) {
  const { floor, goal, offsets, player, stride } = board;
  const hallway = Math.floor(player / stride);
  const walkable = room.inside.slice();
  for (let p = hallway * stride; p < (hallway + 1) * stride; p++) {
    walkable[p] = floor[p];
  }
  const useful = usefulBoxCells(board, room.inside);
  const occupied = new Uint8Array(floor.length);
  const reached = new Int32Array(floor.length);
  const flood = new Int32Array(floor.length);
  const queue = [{ boxes: room.boxes, player, previous: -1, box: 0, direction: 0 }];
  const seen = new Set();
  const scheduled = new Set();
  let stamp = 0;
  let finish = null;

  function reconstruct(index) {
    const pushes = [];
    for (let cursor = index; queue[cursor].previous !== -1; cursor = queue[cursor].previous) {
      const { box, direction } = queue[cursor];
      pushes.push({ box, direction });
    }
    return pushes.reverse();
  }

  for (let i = 0; i < queue.length; i++) {
    const state = queue[i];
    for (const box of state.boxes) occupied[box] = 1;
    stamp++;
    flood[0] = state.player;
    reached[state.player] = stamp;
    let end = 1;
    let representative = state.player;
    let canLeave = false;
    for (let j = 0; j < end; j++) {
      const cell = flood[j];
      if (cell < representative) representative = cell;
      if (Math.floor(cell / stride) === hallway) canLeave = true;
      for (const delta of offsets) {
        const next = cell + delta;
        if (walkable[next] && !occupied[next] && reached[next] !== stamp) {
          reached[next] = stamp;
          flood[end++] = next;
        }
      }
    }
    const key = state.boxes.join(',') + '|' + representative;
    if (!seen.has(key)) {
      seen.add(key);
      if (state.boxes.every((box) => goal[box])) {
        finish ??= reconstruct(i);
        if (canLeave) return { finish, escape: reconstruct(i) };
      }
      for (const [index, box] of state.boxes.entries()) {
        for (let direction = 0; direction < offsets.length; direction++) {
          const delta = offsets[direction];
          const next = box + delta;
          if (!useful[next] || occupied[next] || reached[box - delta] !== stamp) continue;
          const boxes = state.boxes.slice();
          boxes[index] = next;
          boxes.sort((a, b) => a - b);
          const arrival = boxes.join(',') + '|' + box;
          if (queue.length >= MAX_ROOM_STATES || scheduled.has(arrival)) continue;
          scheduled.add(arrival);
          queue.push({ boxes, player: box, previous: i, box, direction });
        }
      }
    }
    for (const box of state.boxes) occupied[box] = 0;
  }
  // A truncated search may leave one of the two finishes unknown.
  return { finish, escape: null };
}

function walk(board, occupied, from, to) {
  const parent = new Int32Array(board.floor.length).fill(-1);
  const queue = [from];
  parent[from] = 4;
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (cell === to) {
      const path = [];
      for (let cursor = to; cursor !== from;) {
        const direction = parent[cursor];
        path.push(MOVES[direction]);
        cursor -= board.offsets[direction];
      }
      return path.reverse().join('');
    }
    for (let direction = 0; direction < board.offsets.length; direction++) {
      const next = cell + board.offsets[direction];
      if (board.floor[next] && !occupied[next] && parent[next] === -1) {
        parent[next] = direction;
        queue.push(next);
      }
    }
  }
  return null;
}

export function solve(level) {
  const board = parse(level);
  if (board.player < 0) return '';
  const rooms = findRooms(board).map((room) => shortestPushes(board, room));
  if (rooms.length === 0) return '';

  let best = null;
  let bestCost = Infinity;
  for (const [last, room] of rooms.entries()) {
    const plan = rooms.filter((_, index) => index !== last).map(({ escape }) => escape);
    plan.push(room.finish);
    if (plan.some((pushes) => pushes === null)) continue;
    const cost = plan.reduce((total, pushes) => total + pushes.length, 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = plan;
    }
  }
  if (best === null) return '';

  const occupied = new Uint8Array(board.floor.length);
  for (const box of board.boxes) occupied[box] = 1;

  let player = board.player;
  const moves = [];
  for (const pushes of best) {
    for (const { box, direction } of pushes) {
      const delta = board.offsets[direction];
      const path = walk(board, occupied, player, box - delta);
      if (path === null) return '';
      moves.push(path, MOVES[direction]);
      occupied[box] = 0;
      occupied[box + delta] = 1;
      player = box;
    }
  }
  return moves.join('');
}

export function makeDeck() {
  const suits = ["S", "H", "D", "C"];
  const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "5"];

  const deck = [];

  for (const s of suits) {
    for (const r of ranks) {
      deck.push({
        s,
        r,
        id: `${r}${s}_${Math.random()}`
      });
    }
  }

  return deck;
}

export function shuffle(deck) {
  return classicShuffle(deck);
}

export function shuffleForMode(deck, mode = "classic") {
  switch (mode) {
    case "light":
      return jusShuffle(deck, 1);
    case "medium":
      return jusShuffle(deck, 2);
    case "heavy":
      return jusShuffle(deck, 4);
    case "classic":
    default:
      return classicShuffle(deck);
  }
}

function classicShuffle(deck) {
  const d = [...deck];

  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }

  return d;
}

function softCut(deck) {
  const d = [...deck];
  const mid = Math.floor(d.length / 2);
  const variance = Math.floor(d.length * 0.12);
  const cut =
    Math.max(1, Math.min(d.length - 1, mid + randInt(-variance, variance)));

  return [...d.slice(cut), ...d.slice(0, cut)];
}

function boxCut(deck) {
  const d = [...deck];
  const size = randInt(4, 10);
  return [...d.slice(size), ...d.slice(0, size)];
}

function rifflePackets(deck, maxPacket = 3) {
  const d = [...deck];
  const cutBase = Math.floor(d.length / 2);
  const cutVariance = Math.floor(d.length * 0.08);
  const cut = Math.max(
    1,
    Math.min(d.length - 1, cutBase + randInt(-cutVariance, cutVariance))
  );

  let left = d.slice(0, cut);
  let right = d.slice(cut);
  const out = [];

  let takeLeft = Math.random() < 0.5;

  while (left.length || right.length) {
    const source = takeLeft ? left : right;

    if (!source.length) {
      takeLeft = !takeLeft;
      continue;
    }

    const packetSize = randInt(1, maxPacket);
    out.push(...source.splice(0, packetSize));
    takeLeft = !takeLeft;
  }

  return out;
}

function jusShuffle(deck, passes) {
  let d = [...deck];

  for (let i = 0; i < passes; i++) {
    d = softCut(d);
    d = rifflePackets(d, i === 0 ? 3 : 4);

    if (Math.random() < 0.7) {
      d = boxCut(d);
    }
  }

  return d;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function nextSeat(seat) {
  return (seat + 1) % 4;
}

export function teamOfSeat(seat) {
  return seat % 2 === 0 ? 0 : 1;
}

export function calcCapturedPoints(cards) {
  let points = 0;

  for (const c of cards) {
    if (c.r === "A") points += 10;
    if (c.r === "10") points += 10;
    if (c.r === "5") points += 5;
  }

  return points;
}

function rankValue(rank) {
  const order = {
    A: 9,
    K: 8,
    Q: 7,
    J: 6,
    "10": 5,
    9: 4,
    8: 3,
    7: 2,
    5: 1
  };

  return order[rank];
}

export function compareCards(a, b, leadSuit, trumpSuit) {
  const aIsTrump = trumpSuit && a.s === trumpSuit;
  const bIsTrump = trumpSuit && b.s === trumpSuit;

  if (aIsTrump && !bIsTrump) return 1;
  if (!aIsTrump && bIsTrump) return -1;

  if (aIsTrump && bIsTrump) {
    return rankValue(a.r) > rankValue(b.r) ? 1 : -1;
  }

  const aFollows = a.s === leadSuit;
  const bFollows = b.s === leadSuit;

  if (aFollows && !bFollows) return 1;
  if (!aFollows && bFollows) return -1;

  if (aFollows && bFollows) {
    return rankValue(a.r) > rankValue(b.r) ? 1 : -1;
  }

  return -1;
}

export function sortHand(hand) {
  const suitOrder = {
    S: 0,
    H: 1,
    D: 2,
    C: 3
  };

  return [...hand].sort((a, b) => {
    if (a.s !== b.s) {
      return suitOrder[a.s] - suitOrder[b.s];
    }

    return rankValue(b.r) - rankValue(a.r);
  });
}
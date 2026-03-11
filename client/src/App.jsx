import React, { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket.js";
import { socket, connectSocket } from "./socket";

const suitSymbol = (s) => ({ S: "♠", H: "♥", D: "♦", C: "♣" }[s] || s);
const isRedSuit = (s) => s === "H" || s === "D";
const isPointCard = (c) => c.r === "A" || c.r === "10" || c.r === "5";
const isHost = state?.hostSocketId === socket.id;

function PlayingCard({
  card,
  small = false,
  point = false,
  onClick,
  disabled = false,
  muted = false
}) {
  const red = isRedSuit(card.s);

  return (
    <button
      className={[
        "playing-card",
        small ? "small" : "",
        point ? "point" : "",
        disabled ? "disabled" : "",
        muted ? "muted-card" : ""
      ].join(" ").trim()}
      onClick={onClick}
      disabled={disabled}
      title={`${card.r}${suitSymbol(card.s)}`}
      type="button"
    >
      <div className={`corner top ${red ? "red" : "black"}`}>
        <div className="rank">{card.r}</div>
        <div className="suit">{suitSymbol(card.s)}</div>
      </div>

      <div className={`center-pip ${red ? "red" : "black"}`}>
        {suitSymbol(card.s)}
      </div>

      <div className={`corner bottom ${red ? "red" : "black"}`}>
        <div className="rank">{card.r}</div>
        <div className="suit">{suitSymbol(card.s)}</div>
      </div>
    </button>
  );


  if (!ok) return;

  socket.emit("stop_game", { roomId });
}

function SeatNameplate({ label, player, isTurn = false, roleText = "", position }) {
  return (
    <div className={`seat-nameplate seat-${position} ${isTurn ? "active" : ""}`}>
      <div className="seat-title">{label}</div>
      <div className="seat-player">{player?.name ?? "Waiting..."}</div>
      <div className="seat-meta">{player ? `${roleText || ""}` : ""}</div>
    </div>
  );
}

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [roomId, setRoomId] = useState("home");
  const [name, setName] = useState("Player");
  const [joined, setJoined] = useState(false);

  const [state, setState] = useState(null);
  const [hand, setHand] = useState([]);
  const [err, setErr] = useState("");
  const [bidAmount, setBidAmount] = useState(50);
  const [nextShuffleMode, setNextShuffleMode] = useState("classic");

  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);

  const [seatAssignments, setSeatAssignments] = useState(["", "", "", ""]);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onState(s) {
      setState(s);
      setErr("");
    }
    function onHand(h) {
      setHand(h);
    }
    function onErr(m) {
      setErr(String(m || ""));
    }
    function onChatMessage(msg) {
      setChat((prev) => [...prev, msg]);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state", onState);
    socket.on("your_hand", onHand);
    socket.on("error_msg", onErr);
    socket.on("chat_message", onChatMessage);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state", onState);
      socket.off("your_hand", onHand);
      socket.off("error_msg", onErr);
      socket.off("chat_message", onChatMessage);
    };
  }, []);

  useEffect(() => {
    if (state?.phase === "BID") {
      setBidAmount(50);
    }
  }, [state?.phase]);

  useEffect(() => {
    if (state?.phase === "HAND_COMPLETE") {
      setNextShuffleMode("classic");
    }
  }, [state?.phase]);

  useEffect(() => {
    if (
      (state?.phase === "LOBBY" || state?.phase === "GAME_OVER") &&
      state?.players
    ) {
      setSeatAssignments(state.players.map((p) => p?.id || ""));
    }
  }, [state?.phase, state?.players]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const mySeat = useMemo(() => {
    if (!state?.players) return -1;
    return state.players.findIndex((p) => p && p.id === socket.id);
  }, [state, connected]);

 <div className="small">
  Debug seat: {mySeat} | Socket: {socket.id || "none"} | Players: {state?.players?.filter(Boolean).length ?? 0}
</div>
  const isHost = useMemo(() => {
    return !!state?.hostSocketId && state.hostSocketId === socket.id;
  }, [state, connected]);

  const canBid = state?.phase === "BID" && state?.turnSeat === mySeat;
  const canDeclare =
    state?.phase === "DECLARE" &&
    state?.turnSeat === mySeat &&
    state?.declarerSeat === mySeat;
  const canPlay = state?.phase === "PLAY" && state?.turnSeat === mySeat;
  const canStartNextHand =
    state?.phase === "HAND_COMPLETE" && mySeat === state?.dealerSeat;

  const highBid = state?.highBid?.amount ?? null;

  const join = () => {
    socket.emit("join", { roomId, name });
    setJoined(true);
  };

  const bid = () => socket.emit("bid", { roomId, amount: Number(bidAmount) });
  const passBid = () => socket.emit("pass_bid", { roomId });
  const dealerTake = () => socket.emit("dealer_take", { roomId });
  const declare = (t) => socket.emit("declare_trump", { roomId, trump: t });
  const play = (cardId) => socket.emit("play_card", { roomId, cardId });
  const startNextHand = () =>
    socket.emit("start_next_hand", { roomId, shuffleMode: nextShuffleMode });

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;

    socket.emit("chat_message", {
      roomId,
      name,
      text
    });

    setChatInput("");
  };

  const saveLobbySeats = () => {
    socket.emit("set_lobby_seats", {
      roomId,
      seatAssignments
    });
  };

  const startGame = () => {
    socket.emit("start_game", { roomId });
  };

  const prepareNextGame = () => {
    socket.emit("prepare_next_game", { roomId });
  };

  const getRoleText = (seat) => {
    if (!state) return "";
    const parts = [];
    if (seat === state.dealerSeat) parts.push("Dealer");
    if (seat === state.declarerSeat) parts.push("Bidder");
    return parts.join(" • ");
  };

  const relativeSeatMap = useMemo(() => {
    if (mySeat < 0) return null;
    return {
      bottom: mySeat,
      left: (mySeat + 1) % 4,
      top: (mySeat + 2) % 4,
      right: (mySeat + 3) % 4
    };
  }, [mySeat]);

  const playersByPos = useMemo(() => {
    if (!state?.players || !relativeSeatMap) return null;
    return {
      bottom: state.players[relativeSeatMap.bottom],
      left: state.players[relativeSeatMap.left],
      top: state.players[relativeSeatMap.top],
      right: state.players[relativeSeatMap.right]
    };
  }, [state, relativeSeatMap]);

  const centerTrick = useMemo(() => {
    if (!state || !relativeSeatMap) return null;

    const mapSeatToPos = {
      [relativeSeatMap.bottom]: "bottom",
      [relativeSeatMap.left]: "left",
      [relativeSeatMap.top]: "top",
      [relativeSeatMap.right]: "right"
    };

    const useCurrent = (state.trick?.plays?.length ?? 0) > 0;
    const source = useCurrent ? state.trick : state.lastTrick;

    if (!source?.plays?.length) {
      return null;
    }

    const cards = {};
    for (const p of source.plays) {
      cards[mapSeatToPos[p.seat]] = p;
    }

    return {
      cards,
      leadSuit: source.leadSuit,
      winnerSeat: source.winnerSeat ?? null,
      isLastTrick: !useCurrent
    };
  }, [state, relativeSeatMap]);

  const trumpWatermark = useMemo(() => {
    if (!state?.trump) return null;

    if (state.trump === "NO_TRUMP") {
      return { text: "NO TRUMP", type: "noTrump" };
    }

    return { text: suitSymbol(state.trump), type: "suit" };
  }, [state?.trump]);

  const playableCardIds = useMemo(() => {
    if (!canPlay) return new Set();

    const leadSuit = state?.trick?.leadSuit;
    if (!leadSuit) {
      return new Set(hand.map((c) => c.id));
    }

    const hasLeadSuit = hand.some((c) => c.s === leadSuit);
    if (!hasLeadSuit) {
      return new Set(hand.map((c) => c.id));
    }

    return new Set(hand.filter((c) => c.s === leadSuit).map((c) => c.id));
  }, [canPlay, state?.trick?.leadSuit, hand]);

  const renderPointCardsOnly = (cards) => {
    const pointCards = (cards || []).filter(isPointCard);

    if (!pointCards.length) {
      return <div className="small muted">None</div>;
    }

    return (
      <div className="summary-cards">
        {pointCards.map((c, idx) => (
          <PlayingCard
            key={`${c.id}-${idx}`}
            card={c}
            small
            point
            disabled
          />
        ))}
      </div>
    );
  };

  const seatedPlayers = (state?.players || []).filter(Boolean);

  return (
    <div className="page">
      <div className="top-bar">
        <div className="panel setup-panel">
          <h2 className="panel-title">Ruff Online Table</h2>
          <div className="small muted">
            Socket: {connected ? "Connected" : "Disconnected"}
          </div>

          {!joined ? (
            <div className="join-row">
              <input
                className="input"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Room"
              />
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
              />
              <button className="btn" onClick={join}>
                Join
              </button>
            </div>
          ) : (
            <div className="small muted" style={{ marginTop: 8 }}>
              Room: {roomId}
              <br />
              You are Player {mySeat >= 0 ? mySeat + 1 : "Not assigned yet"}
              <br />
              {state?.phase === "LOBBY"
                ? isHost
                  ? "You are the setup host."
                  : "Waiting for setup host."
                : state?.phase === "GAME_OVER"
                  ? isHost
                    ? "You are the setup host."
                    : "Waiting for host to prepare next game."
                  : ""}
            </div>
          )}

          {err ? <div className="error-text">{err}</div> : null}
        </div>

        <div className="panel history-panel">
          <h3 className="panel-title">Completed Games</h3>
          {state?.completedGames?.length ? (
            <div className="history-list">
              {state.completedGames.map((g) => (
                <div key={g.gameNumber} className="history-item one-line-history">
                  <span className="history-game-label">Game {g.gameNumber}:</span>
                  <span className={g.winningTeam === 0 ? "history-team-box history-winner" : "history-team-box"}>
                    Team 1 - {g.team1Score}
                  </span>
                  <span className={g.winningTeam === 1 ? "history-team-box history-winner" : "history-team-box"}>
                    Team 2 - {g.team2Score}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="small muted">No completed games yet.</div>
          )}
        </div>
      </div>

      {state?.phase === "LOBBY" && (
        <div className="panel lobby-panel">
          <h3 className="panel-title">Seat Assignment Lobby</h3>

          <div className="small muted" style={{ marginBottom: 12 }}>
            Host assigns who sits in each seat.
            <br />
            Team 1 = Players 1 & 3
            <br />
            Team 2 = Players 2 & 4
            <br />
            First dealer is random.
            {state?.nextGameDealerSeat !== null && state?.nextGameDealerSeat !== undefined ? (
              <>
                <br />
                Next game dealer: Player {state.nextGameDealerSeat + 1}
              </>
            ) : null}
          </div>

          <div className="lobby-grid">
            {[0, 1, 2, 3].map((seat) => (
              <div key={seat} className="lobby-seat-row">
                <label className="lobby-seat-label">Player {seat + 1}</label>
                <select
                  className="input lobby-select"
                  value={seatAssignments[seat] || ""}
                  onChange={(e) => {
                    const next = [...seatAssignments];
                    next[seat] = e.target.value;
                    setSeatAssignments(next);
                  }}
                  disabled={!isHost}
                >
                  <option value="">-- empty --</option>
                  {seatedPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="join-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={saveLobbySeats} disabled={!isHost}>
              Save Seats
            </button>
            <button
              className="btn gold"
              onClick={startGame}
              disabled={!isHost || seatedPlayers.length !== 4}
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      <div className="table-shell">
        <div className="table-felt">
          <div className="table-overlay top-left">
            <div className="overlay-card">
              <div className="overlay-title">Hand Info</div>

                {/*  Added */ }
 <div className="small">
  Debug: You are {mySeat >= 0 ? `Player ${mySeat + 1}` : "not seated"} | Players in room: {state?.players?.filter(Boolean).length ?? 0} | Socket connected: {connected ? "yes" : "no"}
</div>
   <div className="small">
  Debug seat: {mySeat} | Socket: {socket.id || "none"} | Players: {state?.players?.filter(Boolean).length ?? 0}
</div>           

              <div className="small">
                Phase: {state?.phase ?? "-"}
                <br />
                Dealer: {state ? `Player ${state.dealerSeat + 1}` : "-"}
                <br />
                High bid: {highBid ?? "none"}
                <br />
                Winning Bidder:{" "}
                {state?.declarerSeat !== null && state?.declarerSeat !== undefined
                  ? `Player ${state.declarerSeat + 1}`
                  : "-"}
                <br />
                Trump: {state?.trump ?? "-"}
                <br />
                Shuffle: {state?.currentShuffleMode ?? "-"}
                <br />
                {state?.players?.[state?.turnSeat]
                  ? `Turn: Player ${state.turnSeat + 1} (${state.players[state.turnSeat].name})`
                  : ""}
              </div>
            </div>
          </div>

          <div className="table-overlay top-right">
            <div className="overlay-card">
              <div className="overlay-title">Score</div>
              <div className="score-line">
                <span>Team 1</span>
                <strong>{state?.gameScore?.[0] ?? 0}</strong>
              </div>
              <div className="score-line">
                <span>Team 2</span>
                <strong>{state?.gameScore?.[1] ?? 0}</strong>
              </div>
              <div className="small muted" style={{ marginTop: 10 }}>
                Team 1: Players 1 & 3
                <br />
                Team 2: Players 2 & 4
              </div>
            </div>
          </div>

          {playersByPos && relativeSeatMap ? (
            <>
              <SeatNameplate
                label={`Player ${relativeSeatMap.top + 1}`}
                player={playersByPos.top}
                isTurn={state?.turnSeat === relativeSeatMap.top}
                roleText={getRoleText(relativeSeatMap.top)}
                position="top"
              />

              <SeatNameplate
                label={`Player ${relativeSeatMap.left + 1}`}
                player={playersByPos.left}
                isTurn={state?.turnSeat === relativeSeatMap.left}
                roleText={getRoleText(relativeSeatMap.left)}
                position="left"
              />

              <SeatNameplate
                label={`Player ${relativeSeatMap.right + 1}`}
                player={playersByPos.right}
                isTurn={state?.turnSeat === relativeSeatMap.right}
                roleText={getRoleText(relativeSeatMap.right)}
                position="right"
              />

              <div className="center-area">
                <div className="center-title">
                  {centerTrick?.isLastTrick ? "Last Trick" : "Current Trick"}
                </div>

                {trumpWatermark ? (
                  <div
                    className={
                      trumpWatermark.type === "noTrump"
                        ? "trump-watermark-no-trump"
                        : "trump-watermark"
                    }
                  >
                    {trumpWatermark.text}
                  </div>
                ) : null}

                <div className="trick-layout">
                  <div className="trick-slot top-slot">
                    {centerTrick?.cards?.top ? (
                      <>
                        <div className="trick-player-label">
                          Player {centerTrick.cards.top.seat + 1}
                        </div>
                        <PlayingCard card={centerTrick.cards.top.card} />
                      </>
                    ) : null}
                  </div>

                  <div className="trick-slot left-slot">
                    {centerTrick?.cards?.left ? (
                      <>
                        <div className="trick-player-label">
                          Player {centerTrick.cards.left.seat + 1}
                        </div>
                        <PlayingCard card={centerTrick.cards.left.card} />
                      </>
                    ) : null}
                  </div>

                  <div className="trick-center-label">
                    {centerTrick?.leadSuit ? (
                      <>
                        <span className="lead-text">Lead</span>
                        <span className="lead-suit-symbol">{suitSymbol(centerTrick.leadSuit)}</span>
                      </>
                    ) : (
                      "Waiting for lead"
                    )}
                    {centerTrick?.winnerSeat !== null && centerTrick?.winnerSeat !== undefined ? (
                      <>
                        <br />
                        Winner: Player {centerTrick.winnerSeat + 1}
                      </>
                    ) : null}
                  </div>

                  <div className="trick-slot right-slot">
                    {centerTrick?.cards?.right ? (
                      <>
                        <div className="trick-player-label">
                          Player {centerTrick.cards.right.seat + 1}
                        </div>
                        <PlayingCard card={centerTrick.cards.right.card} />
                      </>
                    ) : null}
                  </div>

                  <div className="trick-slot bottom-slot">
                    {centerTrick?.cards?.bottom ? (
                      <>
                        <div className="trick-player-label">
                          Player {centerTrick.cards.bottom.seat + 1}
                        </div>
                        <PlayingCard card={centerTrick.cards.bottom.card} />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="bottom-player-banner">
                <div className={`seat-nameplate inline-seat ${state?.turnSeat === relativeSeatMap.bottom ? "active" : ""}`}>
                  <div className="seat-title">{`Player ${relativeSeatMap.bottom + 1}`}</div>
                  <div className="seat-player">{playersByPos.bottom?.name ?? "Waiting..."}</div>
                  <div className="seat-meta">
                    {playersByPos.bottom ? `${getRoleText(relativeSeatMap.bottom) || ""}` : ""}
                  </div>
                </div>
              </div>

              <div className="table-hand-zone">
                <div className="table-hand-row">
                  {hand.map((c) => {
                    const legalNow = !canPlay || playableCardIds.has(c.id);
                    return (
                      <PlayingCard
                        key={c.id}
                        card={c}
                        point={isPointCard(c)}
                        onClick={() => legalNow && canPlay && play(c.id)}
                        disabled={!legalNow || !canPlay}
                        muted={canPlay && !legalNow}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="waiting-room">Join a room and wait for seat assignment.</div>
          )}
        </div>
      </div>

      {state?.phase === "BID" && (
        <div className="panel action-panel">
          <h3 className="panel-title">Bidding</h3>

          <div className="join-row">
            <input
              className="input"
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              min={50}
              step={5}
              disabled={!canBid}
            />
            <button className="btn" onClick={bid} disabled={!canBid}>
              Bid
            </button>
            <button className="btn secondary" onClick={passBid} disabled={!canBid}>
              Pass
            </button>

            {canBid &&
              mySeat === state.dealerSeat &&
              state.highBid &&
              state.highBid.seat !== state.dealerSeat && (
                <button className="btn gold" onClick={dealerTake}>
                  Dealer Take @ {state.highBid.amount}
                </button>
              )}
          </div>

          <div className="bid-list">
            {(state.bids || []).map((b, i) => (
              <span key={i} className="badge">
                Player {b.seat + 1}:{" "}
                {b.type === "PASS"
                  ? "PASS"
                  : b.type === "TAKE"
                    ? `TAKE ${b.amount}`
                    : b.amount}
              </span>
            ))}
          </div>
        </div>
      )}

      {state?.phase === "DECLARE" && (
        <div className="panel action-panel">
          <h3 className="panel-title">Declare Trump</h3>
          <div className="join-row">
            <button className="btn" onClick={() => declare("S")} disabled={!canDeclare}>♠</button>
            <button className="btn" onClick={() => declare("H")} disabled={!canDeclare}>♥</button>
            <button className="btn" onClick={() => declare("D")} disabled={!canDeclare}>♦</button>
            <button className="btn" onClick={() => declare("C")} disabled={!canDeclare}>♣</button>
            <button className="btn gold" onClick={() => declare("NO_TRUMP")} disabled={!canDeclare}>
              No Trump
            </button>
          </div>
        </div>
      )}

      <div className="panel chat-panel">
        <h3 className="panel-title">Table Chat</h3>

        <div className="chat-log">
          {chat.map((msg, idx) => (
            <div key={`${msg.ts}-${idx}`} className="chat-line">
              <strong>{msg.name}:</strong> {msg.text}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-entry">
          <input
            className="input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendChat();
              }
            }}
            placeholder="Type a message..."
          />
          <button className="btn" onClick={sendChat}>
            Send
          </button>
        </div>
      </div>

      {state?.phase === "HAND_COMPLETE" && state.handSummary && (
        <div className="panel summary-panel">
          <h3 className="panel-title">Hand Complete</h3>

          <div className="small">
            Bid: {state.handSummary.bidAmount}
            {" | "}
            Bidder: Player {state.handSummary.declarerSeat + 1}
            {" | "}
            Trump: {state.handSummary.trump}
            {" | "}
            Result: {state.handSummary.madeBid ? "Made bid" : "Set"}
          </div>

          <div className="summary-grid">
            <div>
              <div className="summary-title">Team 1 point cards</div>
              {renderPointCardsOnly(state.handSummary.capturedCards?.[0])}
            </div>

            <div>
              <div className="summary-title">Team 2 point cards</div>
              {renderPointCardsOnly(state.handSummary.capturedCards?.[1])}
            </div>
          </div>

          <div className="summary-grid score-shift-grid">
            <div className="small">
              Team 1 score: {state.handSummary.gameScoreBefore?.[0]} →{" "}
              {state.handSummary.gameScoreAfter?.[0]}
            </div>
            <div className="small">
              Team 2 score: {state.handSummary.gameScoreBefore?.[1]} →{" "}
              {state.handSummary.gameScoreAfter?.[1]}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {canStartNextHand ? (
              <>
                <div className="summary-title">Next Hand Shuffle</div>
                <div className="join-row" style={{ marginBottom: 10 }}>
                  {["light", "medium", "heavy", "classic"].map((mode) => (
                    <button
                      key={mode}
                      className={`btn ${nextShuffleMode === mode ? "gold" : "secondary"}`}
                      onClick={() => setNextShuffleMode(mode)}
                    >
                      {mode[0].toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>

                <button className="btn" onClick={startNextHand}>
                  Start Next Hand
                </button>
              </>
            ) : (
              <div className="small muted">
                Waiting for Player {state.dealerSeat + 1} to start the next hand.
              </div>
            )}
          </div>
        </div>
      )}

      {state?.phase === "GAME_OVER" && (
        <div className="panel summary-panel">
          <h2 className="panel-title">Game Over</h2>
          <div className="small">
            Final: Team 1 {state.gameScore?.[0] ?? 0} — Team 2{" "}
            {state.gameScore?.[1] ?? 0}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Next game dealer:{" "}
            {state?.nextGameDealerSeat !== null && state?.nextGameDealerSeat !== undefined
              ? `Player ${state.nextGameDealerSeat + 1}`
              : "TBD"}
          </div>

          {isHost ? (
            <div style={{ marginTop: 14 }} className="join-row">
              <button className="btn" onClick={prepareNextGame}>
                Prepare Next Game
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
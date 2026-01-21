import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function secondsToHms(total) {
  const s = Math.max(0, Math.floor(Number(total || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(r)}`;
}

function pace(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "-";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `EKIDEN-${part()}`;
}

const LS = {
  teamCode: "ekiden.teamCode",
  runnerIdByTeam: (teamId) => `ekiden.runnerId.${teamId}`,
};

export default function App() {
  const [team, setTeam] = useState(null);

  // Landing inputs
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // Runners
  const [runners, setRunners] = useState([]);
  const [selectedRunnerId, setSelectedRunnerId] = useState("");
  const [newRunnerName, setNewRunnerName] = useState("");

  // Performance inputs
  const [distanceKm, setDistanceKm] = useState("5");
  const [timeH, setTimeH] = useState("0");
  const [timeM, setTimeM] = useState("25");
  const [timeS, setTimeS] = useState("0");

  // Legs
  const [legs, setLegs] = useState([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Restore last used team code (optional UX)
  useEffect(() => {
    const last = localStorage.getItem(LS.teamCode);
    if (last) setJoinCode(last);
  }, []);

  const totals = useMemo(() => {
    const totalDistance = legs.reduce((acc, l) => acc + Number(l.distance_km || 0), 0);
    const totalSeconds = legs.reduce((acc, l) => acc + Number(l.time_seconds || 0), 0);
    const avgPace = totalDistance > 0 ? totalSeconds / totalDistance : Infinity;
    return { totalDistance, totalSeconds, avgPace };
  }, [legs]);

  function runnerNameById(id) {
    return runners.find((r) => r.id === id)?.name || "Runner";
  }

  async function loadDashboard(teamId) {
    await Promise.all([loadRunners(teamId), loadLegs(teamId)]);
    const saved = localStorage.getItem(LS.runnerIdByTeam(teamId));
    if (saved) setSelectedRunnerId(saved);
  }

  async function loadRunners(teamId) {
    const { data, error } = await supabase
      .from("runners")
      .select("id, name, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    setRunners(data ?? []);
  }

  async function loadLegs(teamId) {
    const { data, error } = await supabase
      .from("legs2")
      .select("runner_id, distance_km, time_seconds, updated_at")
      .eq("team_id", teamId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    setLegs(data ?? []);
  }

  async function createTeam() {
    setMsg("");
    if (!teamName.trim()) return setMsg("Team name required.");
    setLoading(true);
    try {
      const code = makeJoinCode();

      // NOTE: requires RLS disabled on teams (or anon-friendly policies)
      // If your teams table still has NOT NULL created_by, you have 2 options:
      // - make created_by nullable, or
      // - set a default, or
      // - keep this dummy value:
      const { data: t, error: tErr } = await supabase
        .from("teams")
        .insert({ name: teamName.trim(), join_code: code })

        .select("*")
        .single();

      if (tErr) throw tErr;

      setTeam(t);
      localStorage.setItem(LS.teamCode, t.join_code);
      await loadDashboard(t.id);
      setMsg("Team created ✅");
    } catch (e) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function joinTeam() {
    setMsg("");
    if (!joinCode.trim()) return setMsg("Join code required.");
    setLoading(true);
    try {
      const code = joinCode.trim().toUpperCase();
      const { data: t, error: tErr } = await supabase.from("teams").select("*").eq("join_code", code).single();
      if (tErr) throw tErr;

      setTeam(t);
      localStorage.setItem(LS.teamCode, code);
      await loadDashboard(t.id);
      setMsg("Joined team ✅");
    } catch (e) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function createRunner() {
    if (!team?.id) return;
    setMsg("");
    const name = newRunnerName.trim();
    if (!name) return setMsg("Runner name required.");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("runners")
        .insert({ team_id: team.id, name })
        .select("id, name")
        .single();
      if (error) throw error;

      await loadRunners(team.id);
      setSelectedRunnerId(data.id);
      localStorage.setItem(LS.runnerIdByTeam(team.id), data.id);
      setNewRunnerName("");
      setMsg("Runner created ✅");
    } catch (e) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function selectRunner(id) {
    setSelectedRunnerId(id);
    if (team?.id) localStorage.setItem(LS.runnerIdByTeam(team.id), id);
  }

  async function savePerf() {
    if (!team?.id) return;
    setMsg("");
    if (!selectedRunnerId) return setMsg("Select a runner first.");

    const d = Number(distanceKm);
    const h = Number(timeH),
      m = Number(timeM),
      s = Number(timeS);
    const total = h * 3600 + m * 60 + s;

    if (!isFinite(d) || d <= 0) return setMsg("Distance must be > 0.");
    if (!isFinite(total) || total <= 0) return setMsg("Time must be > 0.");

    setLoading(true);
    try {
      const payload = {
        team_id: team.id,
        runner_id: selectedRunnerId,
        distance_km: d,
        time_seconds: total,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("legs2").upsert(payload);
      if (error) throw error;

      await loadLegs(team.id);
      setMsg("Saved ✅");
    } catch (e) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function changeTeam() {
    setTeam(null);
    setRunners([]);
    setLegs([]);
    setSelectedRunnerId("");
    setMsg("");
  }

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Ekiden MVP</h1>
        {team ? <button onClick={changeTeam}>Change team</button> : null}
      </div>

      {msg ? <p style={{ color: msg.includes("✅") ? "green" : "crimson" }}>{msg}</p> : null}
      {loading ? <p>Loading…</p> : null}

      {!team ? (
        <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Create a team</h2>
            <input placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            <div style={{ marginTop: 10 }}>
              <button onClick={createTeam}>Create</button>
            </div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Join a team</h2>
            <input
              placeholder="Join code (ex: EKIDEN-2L3N)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <div style={{ marginTop: 10 }}>
              <button onClick={joinTeam}>Join</button>
            </div>
          </div>

          <div style={{ fontSize: 13, color: "#555" }}>
            
          </div>
        </div>
      ) : (
        <>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginTop: 12 }}>
            <h2 style={{ marginTop: 0 }}>Team: {team.name}</h2>
            <p>
              Access code: <b>{team.join_code}</b>
            </p>
            <p>
              Total distance: <b>{totals.totalDistance.toFixed(2)} km</b>
              <br />
              Total time: <b>{secondsToHms(totals.totalSeconds)}</b>
              <br />
              Avg pace: <b>{pace(totals.avgPace)}</b>
            </p>
          </div>

          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
              <h2 style={{ marginTop: 0 }}>Who are you?</h2>

              {runners.length === 0 ? (
                <p>No runners yet. Create the first one.</p>
              ) : (
                <label>
                  Pick an existing runner:
                  <select
                    value={selectedRunnerId}
                    onChange={(e) => selectRunner(e.target.value)}
                    style={{ marginLeft: 10 }}
                  >
                    <option value="">-- select --</option>
                    {runners.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  placeholder="Or create a new runner name"
                  value={newRunnerName}
                  onChange={(e) => setNewRunnerName(e.target.value)}
                />
                <button onClick={createRunner}>Create runner</button>
              </div>

              {selectedRunnerId ? (
                <p style={{ marginTop: 10 }}>
                  Selected: <b>{runnerNameById(selectedRunnerId)}</b>
                </p>
              ) : null}
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
              <h2 style={{ marginTop: 0 }}>Performance</h2>

              <div style={{ display: "grid", gap: 10 }}>
                <input
                  placeholder="Distance (km)"
                  inputMode="decimal"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span>Time</span>
                  <input style={{ width: 80 }} inputMode="numeric" value={timeH} onChange={(e) => setTimeH(e.target.value)} />
                  <span>h</span>
                  <input style={{ width: 80 }} inputMode="numeric" value={timeM} onChange={(e) => setTimeM(e.target.value)} />
                  <span>m</span>
                  <input style={{ width: 80 }} inputMode="numeric" value={timeS} onChange={(e) => setTimeS(e.target.value)} />
                  <span>s</span>
                </div>

                <button onClick={savePerf} disabled={!selectedRunnerId}>
                  Save
                </button>
              </div>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
              <h2 style={{ marginTop: 0 }}>Team legs</h2>

              {legs.length === 0 ? (
                <p>No performances yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {legs.map((l) => {
                    const dist = Number(l.distance_km || 0);
                    const time = Number(l.time_seconds || 0);
                    const p = dist > 0 ? time / dist : Infinity;

                    return (
                      <div key={l.runner_id} style={{ padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
                        <b>{runnerNameById(l.runner_id)}</b>
                        <div>
                          {dist.toFixed(2)} km — {secondsToHms(time)} — <b>{pace(p)}</b>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

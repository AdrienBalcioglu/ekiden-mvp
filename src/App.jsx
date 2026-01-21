import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function secondsToHms(total) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(r)}`;
}

function secondsPerKmToPace(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "-";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function makeJoinCode() {
  // simple code like EKIDEN-7H2K
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `EKIDEN-${part()}`;
}

export default function App() {
  const [session, setSession] = useState(null);

  // Auth UI
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Team UI
  const [team, setTeam] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // Perf UI
  const [runnerName, setRunnerName] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [timeH, setTimeH] = useState("0");
  const [timeM, setTimeM] = useState("0");
  const [timeS, setTimeS] = useState("0");

  // Team legs
  const [legs, setLegs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadMyTeam() {
    if (!userId) return;
    setLoading(true);
    setMsg("");
    try {
      // find a team_id from memberships
      const { data: memberships, error: mErr } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)
        .limit(1);

      if (mErr) throw mErr;

      const teamId = memberships?.[0]?.team_id;
      if (!teamId) {
        setTeam(null);
        setLegs([]);
        return;
      }

      const { data: t, error: tErr } = await supabase.from("teams").select("*").eq("id", teamId).single();
      if (tErr) throw tErr;
      setTeam(t);

      await loadTeamLegs(t.id);
      await loadMyLeg(t.id);
    } catch (e) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadTeamLegs(teamId) {
    const { data, error } = await supabase
      .from("legs")
      .select("user_id, runner_name, distance_km, time_seconds, updated_at")
      .eq("team_id", teamId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    setLegs(data ?? []);
  }

  async function loadMyLeg(teamId) {
    const { data, error } = await supabase
      .from("legs")
      .select("runner_name, distance_km, time_seconds")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      setRunnerName(data.runner_name ?? "");
      setDistanceKm(String(data.distance_km ?? ""));
      const ts = Number(data.time_seconds ?? 0);
      setTimeH(String(Math.floor(ts / 3600)));
      setTimeM(String(Math.floor((ts % 3600) / 60)));
      setTimeS(String(ts % 60));
    }
  }

  useEffect(() => {
    if (userId) loadMyTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const totals = useMemo(() => {
    const totalDistance = legs.reduce((acc, l) => acc + Number(l.distance_km || 0), 0);
    const totalSeconds = legs.reduce((acc, l) => acc + Number(l.time_seconds || 0), 0);
    const pace = totalDistance > 0 ? totalSeconds / totalDistance : Infinity;
    return { totalDistance, totalSeconds, pace };
  }, [legs]);

  async function signUp() {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else setMsg("Check your email if confirmation is enabled. Otherwise you can sign in.");
  }

  async function signIn() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTeam(null);
    setLegs([]);
  }

  async function createTeam() {
    
console.log("session user id:", session?.user?.id);
const { data: s } = await supabase.auth.getSession();
console.log("getSession:", s?.session?.user?.id, "access_token?", !!s?.session?.access_token);

    setMsg("");
    if (!teamName.trim()) return setMsg("Team name required.");
    setLoading(true);
    try {
      const code = makeJoinCode();
      const { data: t, error: tErr } = await supabase
        .from("teams")
        .insert({ name: teamName.trim(), join_code: code, created_by: userId })
        .select("*")
        .single();
      if (tErr) throw tErr;

      const { error: mErr } = await supabase.from("team_members").insert({ team_id: t.id, user_id: userId });
      if (mErr) throw mErr;

      setTeam(t);
      setTeamName("");
      await loadTeamLegs(t.id);
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

      const { error: mErr } = await supabase.from("team_members").insert({ team_id: t.id, user_id: userId });
      if (mErr) throw mErr;

      setTeam(t);
      setJoinCode("");
      await loadTeamLegs(t.id);
      await loadMyLeg(t.id);
    } catch (e) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveMyPerf() {
    if (!team?.id) return;
    setMsg("");
    setLoading(true);
    try {
      const d = Number(distanceKm);
      const h = Number(timeH), m = Number(timeM), s = Number(timeS);
      const total = h * 3600 + m * 60 + s;

      if (!isFinite(d) || d <= 0) return setMsg("Distance must be > 0.");
      if (!isFinite(total) || total <= 0) return setMsg("Time must be > 0.");

      const payload = {
        team_id: team.id,
        user_id: userId,
        runner_name: runnerName.trim() || null,
        distance_km: d,
        time_seconds: total,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("legs").upsert(payload);
      if (error) throw error;

      await loadTeamLegs(team.id);
      setMsg("Saved ✅");
    } catch (e) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!session) {
    return (
      <div style={{ padding: 20, maxWidth: 520 }}>
        <h1>Ekiden MVP</h1>
        <p>Login required</p>

        <div style={{ display: "grid", gap: 10 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={signIn}>Sign in</button>
            <button onClick={signUp}>Sign up</button>
          </div>

          {msg && <p style={{ color: "crimson" }}>{msg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1>Ekiden MVP</h1>
        <button onClick={signOut}>Sign out</button>
      </div>

      {msg && <p style={{ color: msg.includes("✅") ? "green" : "crimson" }}>{msg}</p>}
      {loading && <p>Loading…</p>}

      {!team ? (
        <div style={{ display: "grid", gap: 18, marginTop: 10 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Create a team</h2>
            <input placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            <div style={{ marginTop: 10 }}>
              <button onClick={createTeam}>Create</button>
            </div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Join a team</h2>
            <input placeholder="Join code (ex: EKIDEN-7H2K)" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
            <div style={{ marginTop: 10 }}>
              <button onClick={joinTeam}>Join</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginTop: 10 }}>
            <h2 style={{ marginTop: 0 }}>Team: {team.name}</h2>
            <p>
              Join code: <b>{team.join_code}</b>
            </p>
            <p>
              Total distance: <b>{totals.totalDistance.toFixed(2)} km</b>
              <br />
              Total time: <b>{secondsToHms(totals.totalSeconds)}</b>
              <br />
              Avg pace: <b>{secondsPerKmToPace(totals.pace)}</b>
            </p>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>My performance</h2>
            <div style={{ display: "grid", gap: 10 }}>
              <input placeholder="Runner name (optional)" value={runnerName} onChange={(e) => setRunnerName(e.target.value)} />

              <input
                placeholder="Distance (km)"
                inputMode="decimal"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span>Time</span>
                <input style={{ width: 80 }} inputMode="numeric" value={timeH} onChange={(e) => setTimeH(e.target.value)} />
                <span>h</span>
                <input style={{ width: 80 }} inputMode="numeric" value={timeM} onChange={(e) => setTimeM(e.target.value)} />
                <span>m</span>
                <input style={{ width: 80 }} inputMode="numeric" value={timeS} onChange={(e) => setTimeS(e.target.value)} />
                <span>s</span>
              </div>

              <button onClick={saveMyPerf}>Save</button>
            </div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>Team legs</h2>

            {legs.length === 0 ? (
              <p>No performances yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {legs.map((l) => {
                  const dist = Number(l.distance_km || 0);
                  const time = Number(l.time_seconds || 0);
                  const pace = dist > 0 ? time / dist : Infinity;
                  const isMe = l.user_id === userId;

                  return (
                    <div key={l.user_id} style={{ padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <b>{l.runner_name || (isMe ? "Me" : "Runner")}</b>
                        <span>{isMe ? "You" : ""}</span>
                      </div>
                      <div>
                        {dist.toFixed(2)} km — {secondsToHms(time)} — <b>{secondsPerKmToPace(pace)}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

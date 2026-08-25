const config = {
  requestLimit: 0.25,
  userHourlyLimit: 0.75,
  userDailyLimit: 2,
  dailyLimit: 5,
  monthlyLimit: 80,
  globalLimit: 500,
  failureLimit: 6
};

function state(spent, limit) {
  if (!limit) return "disabled";
  const ratio = spent / limit;
  if (ratio >= 1) return "blocked";
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.85) return "warning";
  if (ratio >= 0.7) return "watch";
  return "ok";
}

function simulate(input) {
  if (input.killSwitch) return { allowed: false, reason: "kill_switch" };
  const checks = [
    ["request_cost_limit", state(input.requestCost || 0, config.requestLimit)],
    ["user_hourly_limit", state(input.userHour || 0, config.userHourlyLimit)],
    ["user_daily_limit", state(input.userDay || 0, config.userDailyLimit)],
    ["daily_limit", state(input.day || 0, config.dailyLimit)],
    ["monthly_limit", state(input.month || 0, config.monthlyLimit)],
    ["global_limit", state(input.global || 0, config.globalLimit)],
    ["circuit_breaker", (input.failures || 0) >= config.failureLimit ? "blocked" : "ok"]
  ];
  const blocked = checks.find(([, value]) => value === "blocked");
  if (blocked) return { allowed: false, reason: blocked[0] };
  const warning = checks.find(([, value]) => value === "warning" || value === "critical" || value === "watch");
  return { allowed: true, reason: warning?.[0] || "ok", status: warning?.[1] || "ok" };
}

const scenarios = [
  ["normal", { requestCost: 0.03, userHour: 0.1, userDay: 0.4, day: 1, month: 12, global: 140 }, true],
  ["kill switch", { killSwitch: true }, false, "kill_switch"],
  ["request too expensive", { requestCost: 0.4 }, false, "request_cost_limit"],
  ["user hourly blocked", { userHour: 0.8 }, false, "user_hourly_limit"],
  ["user daily blocked", { userDay: 2.1 }, false, "user_daily_limit"],
  ["daily blocked", { day: 5.1 }, false, "daily_limit"],
  ["monthly blocked", { month: 81 }, false, "monthly_limit"],
  ["global blocked", { global: 501 }, false, "global_limit"],
  ["circuit breaker", { failures: 6 }, false, "circuit_breaker"],
  ["warning allowed", { day: 4.3 }, true, "daily_limit"]
];

const rows = scenarios.map(([name, input, allowed, reason]) => {
  const result = simulate(input);
  const ok = result.allowed === allowed && (!reason || result.reason === reason);
  return { name, ok, allowed: result.allowed, reason: result.reason, status: result.status || "" };
});

console.table(rows);
const failed = rows.filter((row) => !row.ok);
if (failed.length) {
  console.error(`${failed.length}/${rows.length} simulations Cost Guard en echec.`);
  process.exitCode = 1;
} else {
  console.log(`${rows.length}/${rows.length} simulations Cost Guard OK.`);
}

/** HUD + overlay helpers. */

import { STAGE_COUNT } from "./levels.js";

export class UI {
  constructor() {
    this.hud = document.getElementById("hud");
    this.hudStage = document.getElementById("hud-stage");
    this.hudAlt = document.getElementById("hud-alt");
    this.hudTime = document.getElementById("hud-time");
    this.hint = document.getElementById("hint-banner");
    this.walkStats = document.getElementById("walk-stats");
    this.hudSpeed = document.getElementById("hud-speed");
    this.hudGait = document.getElementById("hud-gait");
    this.btnFf = document.getElementById("btn-ff");

    this.panels = {
      title: document.getElementById("panel-title"),
      clear: document.getElementById("panel-clear"),
      fail: document.getElementById("panel-fail"),
      review: document.getElementById("panel-review"),
      done: document.getElementById("panel-done"),
    };
  }

  showHud(on) {
    this.hud.classList.toggle("hidden", !on);
  }

  setStage(n, alt) {
    this.hudStage.textContent = `STAGE ${n}/${STAGE_COUNT}`;
    this.hudAlt.textContent = `ALT ${alt}m`;
  }

  setTime(seconds) {
    this.hudTime.textContent = seconds.toFixed(2);
  }

  setHint(text, warn = false) {
    this.hint.textContent = text;
    this.hint.classList.toggle("warn", !!warn);
    this.hint.classList.remove("hidden");
  }

  hideHint() {
    this.hint.classList.add("hidden");
  }

  showWalkStats(on) {
    this.walkStats.classList.toggle("hidden", !on);
  }

  setSpeed(kmh, gait) {
    this.hudSpeed.textContent = `${kmh.toFixed(0)} km/h`;
    this.hudGait.textContent = gait;
  }

  setFF(on) {
    this.btnFf.classList.toggle("on", on);
  }

  showOnly(name) {
    for (const [k, el] of Object.entries(this.panels)) {
      el.classList.toggle("hidden", k !== name);
    }
  }

  hidePanels() {
    for (const el of Object.values(this.panels)) el.classList.add("hidden");
  }

  showClear(stageTime, stage) {
    document.getElementById("clear-time").textContent = stageTime.toFixed(2);
    document.getElementById("clear-sub").textContent = `Stage ${stage.id} · ${stage.alt}m`;
    this.showOnly("clear");
  }

  showFail(totalTime, stage, clearedCount) {
    document.getElementById("fail-ribbon").textContent = `Fell at Stage ${stage.id}…`;
    document.getElementById("fail-time").textContent = totalTime.toFixed(2);
    document.getElementById("fail-sub").textContent =
      `${stage.alt}m · ${clearedCount} stage${clearedCount === 1 ? "" : "s"} cleared`;
    const pips = document.getElementById("fail-pips");
    pips.innerHTML = "";
    for (let i = 0; i < STAGE_COUNT; i++) {
      const s = document.createElement("span");
      if (i < clearedCount) s.className = "clear";
      else if (i === clearedCount) s.className = "fail";
      pips.appendChild(s);
    }
    this.showOnly("fail");
  }

  showDone(totalTime) {
    document.getElementById("done-time").textContent = totalTime.toFixed(2);
    this.showOnly("done");
  }

  showReview() {
    this.showOnly("review");
  }

  showTitle() {
    this.showOnly("title");
  }
}

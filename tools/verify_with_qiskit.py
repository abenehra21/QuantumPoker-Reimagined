#!/usr/bin/env python3
"""Cross-check this game's state-vector simulator against Qiskit.

The browser game has no dependencies and computes its own amplitudes. This
script is the proof that those amplitudes are right: it replays the same
circuits through Qiskit's Statevector and compares, up to global phase.

    pip install -r requirements.txt
    node tools/dump_states.js 400 > /tmp/states.json
    python3 tools/verify_with_qiskit.py /tmp/states.json

Qubit 0 is the least significant bit on both sides (Qiskit's own ordering),
so the basis indices line up without any relabelling.

Exits non-zero if anything disagrees.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

try:
    from qiskit import QuantumCircuit
    from qiskit.quantum_info import Statevector
except ImportError:  # pragma: no cover - the message is the point
    sys.exit("qiskit is not installed. Run: pip install -r requirements.txt")

ROOT = Path(__file__).resolve().parent.parent
TOL = 1e-9


def build(n: int, ops: list[dict]) -> QuantumCircuit:
    """Rebuild one of our circuits as a Qiskit circuit."""
    qc = QuantumCircuit(n)
    for o in ops:
        op, t, p = o["op"], o["targets"], o.get("param")
        if op == "x":
            qc.x(t[0])
        elif op == "y":
            qc.y(t[0])
        elif op == "z":
            qc.z(t[0])
        elif op == "h":
            qc.h(t[0])
        elif op == "s":
            qc.s(t[0])
        elif op == "sdg":
            qc.sdg(t[0])
        elif op == "t":
            qc.t(t[0])
        elif op == "tdg":
            qc.tdg(t[0])
        elif op == "rx":
            qc.rx(p, t[0])
        elif op == "ry":
            qc.ry(p, t[0])
        elif op == "rz":
            # Our rz is exp(-i a Z / 2), matching Qiskit's rz exactly.
            qc.rz(p, t[0])
        elif op == "phase":
            qc.p(p, t[0])
        elif op == "cx":
            qc.cx(t[0], t[1])
        elif op == "cz":
            qc.cz(t[0], t[1])
        elif op == "swap":
            qc.swap(t[0], t[1])
        elif op == "cphase":
            qc.cp(p, t[0], t[1])
        elif op == "ccx":
            qc.ccx(t[0], t[1], t[2])
        elif op == "mcz":
            # A multi-controlled Z: every listed qubit controls a pi phase.
            qc.mcp(np.pi, t[:-1], t[-1])
        else:
            raise ValueError(f"no Qiskit mapping for {op}")
    return qc


def fidelity(a: np.ndarray, b: np.ndarray) -> float:
    """|<a|b>|^2. Equals 1 exactly when the states agree up to global phase."""
    return float(abs(np.vdot(a, b)) ** 2)


def check(case: dict) -> tuple[bool, float]:
    """Replay a case in Qiskit and compare, up to global phase."""
    ours = np.array(case["re"], dtype=complex) + 1j * np.array(case["im"], dtype=complex)
    # A card case carries the board preparation and then the instructions the
    # card itself recorded, so Qiskit replays what the card says it did.
    ops = case.get("prep", []) + case.get("ops", [])
    theirs = Statevector(build(case["n"], ops)).data
    f = fidelity(ours, theirs)
    return f > 1 - TOL, f


def main() -> int:
    if len(sys.argv) > 1:
        data = json.loads(Path(sys.argv[1]).read_text())
    else:
        print("Generating circuits with node…")
        out = subprocess.run(
            ["node", str(ROOT / "tools" / "dump_states.js"), "400"],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(out.stdout)

    failures = []
    for i, case in enumerate(data["cases"]):
        ok, f = check(case)
        if not ok:
            failures.append((i, f, case))
    print(f"{len(data['cases']) - len(failures)}/{len(data['cases'])} random circuits "
          f"match Qiskit to a fidelity of 1 - {TOL:g}")

    cards = data.get("cardCases", [])
    card_bad = []
    for c in cards:
        ok, f = check(c)
        if not ok:
            card_bad.append((c["card"], f))
    print(f"{len(cards) - len(card_bad)}/{len(cards)} deck cards do in Qiskit "
          f"exactly what their circuit notation says")
    for name, f in card_bad[:8]:
        print(f"    {name}: fidelity {f:.12f}")

    for i, f, case in failures[:5]:
        print(f"\n  case {i}: fidelity {f:.12f}")
        for o in case["ops"]:
            print(f"    {o['op']} {o['targets']}" + (f" ({o['param']})" if o.get("param") is not None else ""))

    if failures or card_bad:
        print(f"\n{len(failures) + len(card_bad)} disagreements.")
        return 1
    print("\nThe browser simulator agrees with Qiskit everywhere it was asked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

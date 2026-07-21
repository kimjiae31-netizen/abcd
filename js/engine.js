// 회로 수치해석 시뮬레이션 엔진 (Modified Nodal Analysis - 전선 저항 스탬핑 개선)

export class CircuitEngine {
  constructor() {
    this.nodes = [];
    this.numNodes = 0;
    this.voltageSources = [];
    this.matrixSize = 0;
    this.A = [];
    this.z = [];
    this.x = [];
    this.dt = 0.05;
    this.maxBulbCurrent = 2.5; // 전구 파손 한계값 소폭 상향 조정
  }

  solve(components, wires, simSpeed = 1.0) {
    const currentDt = this.dt * simSpeed;
    if (currentDt === 0) return;

    // 1. 노드 생성 (Union-Find)
    // 개선안: 전선을 같은 노드로 다 통합하지 않고, 닿아있는 포트 포인트들끼리만 결합시킵니다.
    // 전선(Wire) 자체는 양단 접점(p_start, p_end)을 0.05Ω의 저항으로 연결하는 소자처럼 행렬에 주입합니다.
    this.buildNodes(components, wires);

    if (this.nodes.length === 0) return;

    const N = this.nodes.length;
    this.voltageSources = components.filter(c => c.type === 'battery');
    const M = this.voltageSources.length;
    
    this.matrixSize = (N - 1) + M;
    if (this.matrixSize <= 0) {
      this.resetStates(components, wires);
      return;
    }

    // 행렬 초기화
    this.A = Array.from({ length: this.matrixSize }, () => new Float64Array(this.matrixSize));
    this.z = new Float64Array(this.matrixSize);

    // 2. 소자 스탬핑
    // 2-1. 전선(Wire) 스탬핑: 미세 저항(0.05Ω) 소자로 스탬프 처리
    wires.forEach(wire => {
      const p1 = wire.ports[0]; // S
      const p2 = wire.ports[1]; // E
      const g = 1.0 / wire.resistance; // 20 Siemens
      
      this.stampResistor(p1.nodeIndex, p2.nodeIndex, g);
    });

    // 2-2. 일반 저항 및 전구
    components.forEach(comp => {
      if (comp.type === 'resistor' || comp.type === 'lightbulb') {
        const p1 = comp.ports[0];
        const p2 = comp.ports[1];
        
        let R = comp.resistance;
        if (comp.type === 'lightbulb' && comp.burntOut) {
          R = 1e8;
        }
        
        const g = 1.0 / Math.max(1e-4, R);
        this.stampResistor(p1.nodeIndex, p2.nodeIndex, g);
      }
      
      // 2-3. 축전기 (Capacitor)
      else if (comp.type === 'capacitor') {
        const p1 = comp.ports[0];
        const p2 = comp.ports[1];
        // 시각적으로 일정한 속도의 충방전(2~4초)을 관찰할 수 있도록 정전용량 스케일 조정
        const C = comp.capacitance * 1e-3;
        
        const gEq = C / currentDt;
        const iEq = gEq * comp.vPrev;

        this.stampResistor(p1.nodeIndex, p2.nodeIndex, gEq);
        this.stampCurrentSource(p1.nodeIndex, p2.nodeIndex, iEq);
      }
      
      // 2-4. 스위치 (Switch)
      else if (comp.type === 'switch') {
        const pCom = comp.ports[0];
        const pOn = comp.ports[1];
        const pOff = comp.ports[2];
        
        const rOn = 1e-3;
        const rOff = 1e8;
        
        if (!comp.isOpen) {
          this.stampResistor(pCom.nodeIndex, pOn.nodeIndex, 1.0 / rOn);
          this.stampResistor(pCom.nodeIndex, pOff.nodeIndex, 1.0 / rOff);
        } else {
          this.stampResistor(pCom.nodeIndex, pOn.nodeIndex, 1.0 / rOff);
          this.stampResistor(pCom.nodeIndex, pOff.nodeIndex, 1.0 / rOn);
        }
      }
      
      // 2-5. NPN 트랜지스터 (Transistor)
      else if (comp.type === 'transistor') {
        const pB = comp.ports[0];
        const pC = comp.ports[1];
        const pE = comp.ports[2];

        const vB = this.getNodeVoltage(pB.nodeIndex);
        const vE = this.getNodeVoltage(pE.nodeIndex);
        const vC = this.getNodeVoltage(pC.nodeIndex);
        const vBE = vB - vE;
        
        const rBE = vBE > 0.7 ? 50.0 : 1e7;
        this.stampResistor(pB.nodeIndex, pE.nodeIndex, 1.0 / rBE);

        const ib = Math.max(0.0, vBE / rBE);
        comp.ib = ib;

        const vCE = Math.max(0.0, vC - vE);
        let rCE = 1e7;
        
        if (ib > 1e-6) {
          const expectedIc = comp.beta * ib;
          rCE = Math.max(0.1, vCE / Math.max(1e-5, expectedIc));
        }
        
        this.stampResistor(pC.nodeIndex, pE.nodeIndex, 1.0 / rCE);
      }
    });

    // 2-6. 전압원 (Battery) 스탬핑
    for (let k = 0; k < M; k++) {
      const bat = this.voltageSources[k];
      const pNeg = bat.ports[0];
      const pPos = bat.ports[1];
      const V = bat.voltage;
      
      const vIdx = (N - 1) + k;
      this.stampVoltageSource(pNeg.nodeIndex, pPos.nodeIndex, V, vIdx);
    }

    // 3. 선형방정식 솔버 실행
    this.x = this.solveMatrix(this.A, this.z);

    if (!this.x) {
      this.resetStates(components, wires);
      return;
    }

    // 4. 상태 갱신
    this.updateComponentsState(components, wires, currentDt);
  }

  stampResistor(n1, n2, g) {
    if (n1 > 0) this.A[n1 - 1][n1 - 1] += g;
    if (n2 > 0) this.A[n2 - 1][n2 - 1] += g;
    if (n1 > 0 && n2 > 0) {
      this.A[n1 - 1][n2 - 1] -= g;
      this.A[n2 - 1][n1 - 1] -= g;
    }
  }

  stampCurrentSource(n1, n2, i) {
    if (n1 > 0) this.z[n1 - 1] -= i;
    if (n2 > 0) this.z[n2 - 1] += i;
  }

  stampVoltageSource(nNeg, nPos, V, vIdx) {
    if (nPos > 0) {
      this.A[nPos - 1][vIdx] += 1;
      this.A[vIdx][nPos - 1] += 1;
    }
    if (nNeg > 0) {
      this.A[nNeg - 1][vIdx] -= 1;
      this.A[vIdx][nNeg - 1] -= 1;
    }
    this.z[vIdx] = V;
  }

  getNodeVoltage(nodeIdx) {
    if (nodeIdx <= 0) return 0.0;
    if (!this.x || nodeIdx - 1 >= this.x.length) return 0.0;
    return this.x[nodeIdx - 1];
  }

  updateComponentsState(components, wires, dt) {
    let voltageSourceIdx = 0;
    const N = this.nodes.length;

    // 전선(Wires) 전류 갱신 추가
    wires.forEach(wire => {
      const p1 = wire.ports[0];
      const p2 = wire.ports[1];
      const v1 = this.getNodeVoltage(p1.nodeIndex);
      const v2 = this.getNodeVoltage(p2.nodeIndex);
      // I = V/R
      wire.current = (v2 - v1) / wire.resistance;
    });

    components.forEach(comp => {
      const p1 = comp.ports[0];
      const p2 = comp.ports[1];

      const v1 = this.getNodeVoltage(p1.nodeIndex);
      const v2 = this.getNodeVoltage(p2.nodeIndex);
      const vDiff = v2 - v1;

      if (comp.type === 'battery') {
        const vIdx = (N - 1) + voltageSourceIdx;
        comp.current = this.x[vIdx];
        voltageSourceIdx++;
      }
      else if (comp.type === 'resistor') {
        comp.current = vDiff / comp.resistance;
      }
      else if (comp.type === 'lightbulb') {
        const I = vDiff / comp.resistance;
        comp.current = I;

        if (!comp.burntOut) {
          if (Math.abs(I) > this.maxBulbCurrent) {
            comp.burntOut = true;
            comp.brightness = 0;
            comp.current = 0;
          } else if (Math.abs(I) > 1e-4) {
            // 전류가 흐르고 있으면 무조건 빛이 나도록 기본 최소 밝기(0.3) 보장
            const power = I * I * comp.resistance;
            const maxPower = this.maxBulbCurrent * this.maxBulbCurrent * comp.resistance;
            const b = power / (maxPower * 0.3);
            comp.brightness = Math.max(0.3, Math.min(1.0, b));
          } else {
            comp.brightness = 0;
          }
        }
      }
      else if (comp.type === 'capacitor') {
        const C = comp.capacitance * 1e-3;
        comp.voltage = vDiff;
        comp.charge = C * vDiff;

        // 전압이 0V 부근(0.005V 이하)으로 방전 완료되면 완전히 0V 및 전류 0A 처리
        if (Math.abs(vDiff) < 0.005) {
          comp.voltage = 0.0;
          comp.charge = 0.0;
          comp.current = 0.0;
          comp.vPrev = 0.0;
        } else {
          comp.current = (vDiff - comp.vPrev) * (C / dt);
          comp.vPrev = vDiff;
        }
      }
      else if (comp.type === 'switch') {
        const pCom = comp.ports[0];
        const pOn = comp.ports[1];
        const pOff = comp.ports[2];
        const vCom = this.getNodeVoltage(pCom.nodeIndex);
        const vOn = this.getNodeVoltage(pOn.nodeIndex);
        const vOff = this.getNodeVoltage(pOff.nodeIndex);

        if (!comp.isOpen) {
          comp.current = (vCom - vOn) / 1e-3;
        } else {
          comp.current = (vCom - vOff) / 1e-3;
        }
      }
      else if (comp.type === 'transistor') {
        const pB = comp.ports[0];
        const pC = comp.ports[1];
        const pE = comp.ports[2];
        const vB = this.getNodeVoltage(pB.nodeIndex);
        const vC = this.getNodeVoltage(pC.nodeIndex);
        const vE = this.getNodeVoltage(pE.nodeIndex);

        const vBE = vB - vE;
        const vCE = vC - vE;
        const rBE = vBE > 0.7 ? 50.0 : 1e7;
        comp.ib = Math.max(0.0, vBE / rBE);
        
        let rCE = 1e7;
        if (comp.ib > 1e-6) {
          const expectedIc = comp.beta * comp.ib;
          rCE = Math.max(0.1, vCE / Math.max(1e-5, expectedIc));
        }
        comp.ic = Math.max(0.0, vCE / rCE);
        comp.ie = comp.ib + comp.ic;
      }
    });
  }

  resetStates(components, wires) {
    wires.forEach(w => w.current = 0);
    components.forEach(comp => {
      comp.current = 0;
      if (comp.type === 'lightbulb') comp.brightness = 0;
      if (comp.type === 'capacitor') {
        comp.voltage = 0;
        comp.charge = 0;
        comp.vPrev = 0;
      }
      if (comp.type === 'transistor') {
        comp.ib = 0;
        comp.ic = 0;
        comp.ie = 0;
      }
    });
    this.x = null;
  }

  // Union-Find 노드 구축 개선:
  // 포트의 좌표가 가까워서 닿아있거나 port.connectedTo가 설정된 물리적 '접합점'들만 하나의 노드로 묶습니다.
  // 전선(Wire)은 병합의 가교가 되지 않고 0.05Ω의 저항으로 두 닿아있는 접합점 노드를 연결합니다.
  buildNodes(components, wires) {
    const allPorts = [];
    components.forEach(c => allPorts.push(...c.ports));
    wires.forEach(w => allPorts.push(...w.ports));

    if (allPorts.length === 0) {
      this.nodes = [];
      return;
    }

    const parent = new Map();
    allPorts.forEach(port => parent.set(port, port));

    function find(port) {
      let root = port;
      while (parent.get(root) !== root) {
        root = parent.get(root);
      }
      let curr = port;
      while (curr !== root) {
        let nxt = parent.get(curr);
        parent.set(curr, root);
        curr = nxt;
      }
      return root;
    }

    function union(portA, portB) {
      const rootA = find(portA);
      const rootB = find(portB);
      if (rootA !== rootB) {
        parent.set(rootA, rootB);
      }
    }

    // 포트가 서로 겹치거나 연결선(connectedTo)이 닿아 있는 지점만 병합
    const touchDistance = 15;
    for (let i = 0; i < allPorts.length; i++) {
      const portA = allPorts[i];
      const posA = portA.getAbsolutePos();

      if (portA.connectedTo) {
        union(portA, portA.connectedTo);
      }

      for (let j = i + 1; j < allPorts.length; j++) {
        const portB = allPorts[j];
        
        // 동일 컴포넌트 내부의 다른 포트끼리는 쇼트 방지를 위해 예외 처리
        // 단, 전선(Wire) 내의 서로 다른 포트 역시 0.05Ω으로 해석해야 하므로 병합하지 않습니다!
        if (portA.parent === portB.parent) {
          continue;
        }

        const posB = portB.getAbsolutePos();
        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const dist = Math.hypot(dx, dy);

        if (dist < touchDistance) {
          union(portA, portB);
        }
      }
    }

    const nodeGroups = new Map();
    allPorts.forEach(port => {
      const root = find(port);
      if (!nodeGroups.has(root)) {
        nodeGroups.set(root, []);
      }
      nodeGroups.get(root).push(port);
    });

    this.nodes = Array.from(nodeGroups.values());

    let gndNodeIndex = -1;
    for (let i = 0; i < this.nodes.length; i++) {
      const hasBatteryNeg = this.nodes[i].some(port => {
        return port.parent.type === 'battery' && port.label === '-';
      });
      if (hasBatteryNeg) {
        gndNodeIndex = i;
        break;
      }
    }

    if (gndNodeIndex === -1 && this.nodes.length > 0) {
      gndNodeIndex = 0;
    }

    if (gndNodeIndex > 0) {
      const temp = this.nodes[0];
      this.nodes[0] = this.nodes[gndNodeIndex];
      this.nodes[gndNodeIndex] = temp;
    }

    this.nodes.forEach((nodePorts, index) => {
      nodePorts.forEach(port => {
        port.nodeIndex = index;
      });
    });
  }

  solveMatrix(A, z) {
    const n = z.length;
    const M = Array.from({ length: n }, (_, i) => {
      const row = new Float64Array(n + 1);
      row.set(A[i]);
      row[n] = z[i];
      return row;
    });

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
          maxRow = k;
        }
      }

      const temp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = temp;

      if (Math.abs(M[i][i]) < 1e-12) {
        return null;
      }

      for (let k = i + 1; k < n; k++) {
        const factor = M[k][i] / M[i][i];
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }

    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = M[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= M[i][j] * x[j];
      }
      x[i] /= M[i][i];
    }

    return x;
  }
}

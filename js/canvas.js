// 회로 캔버스 렌더링 및 마우스 인터랙션 처리 (패닝, 전선 스냅, 분기 접점 생성, 딸깍 효과음, 실행 취소/다시 실행 지원)

import { Battery, Resistor, Lightbulb, Capacitor, Switch, Transistor, Wire } from './components.js';

export class CircuitCanvas {
  constructor(canvasId, engine) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.engine = engine;

    this.components = [];
    this.wires = [];

    // 화이트보드 패닝 오프셋
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // 인터랙션 상태 변수
    this.draggedComponent = null;
    this.activePort = null;      // 전선 드래그를 시작한 포트
    this.tempWirePos = null;     // { x, y } 드래그 중인 현재 임시 마우스 좌표
    this.selectedComponent = null;
    this.selectedWire = null;

    // 측정 도구 상태
    this.activeTool = 'none';
    this.hoveredPort = null;
    this.hoveredComponent = null;
    this.hoveredWire = null;
    this.mousePos = { x: 0, y: 0 };

    this.visualMode = 'current';

    // 컴포넌트 한글 순번 생성 카운터
    this.namingCounters = {
      battery: 1,
      resistor: 1,
      lightbulb: 1,
      capacitor: 1,
      switch: 1,
      transistor: 1,
      wire: 1
    };

    // 실행 취소/다시 실행 히스토리 스택
    this.undoStack = [];
    this.redoStack = [];

    // 오디오 컨텍스트 (딸깍음)
    this.audioCtx = null;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.setupEvents();
    this.setupKeyboardEvents();
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  setVisualMode(mode) {
    this.visualMode = mode;
  }

  // Web Audio API를 활용한 딸깍 소리
  playSnapSound() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      osc.type = 'triangle';
      // 높은 주파수에서 순식간에 떨어지는 클릭음
      osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 0.05);

      gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);

      osc.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.05);
    } catch (err) {
      console.warn("Audio context failed to play sound: ", err);
    }
  }

  // --- 히스토리 관리 (Undo/Redo) ---
  saveHistory() {
    // 현재 회로 상태를 직렬화하여 스택에 추가
    const state = this.serializeState();
    this.undoStack.push(state);
    this.redoStack = []; // 새로운 동작 시 Redo 스택 초기화
    
    // 최대 100개 기록 제한
    if (this.undoStack.length > 100) {
      this.undoStack.shift();
    }
  }

  serializeState() {
    // 컴포넌트 깊은 복사
    const serializedComponents = this.components.map(c => {
      return {
        id: c.id,
        type: c.type,
        x: c.x,
        y: c.y,
        // 고유 속성들
        voltage: c.voltage,
        resistance: c.resistance,
        capacitance: c.capacitance,
        beta: c.beta,
        isOpen: c.isOpen,
        burntOut: c.burntOut,
        brightness: c.brightness,
        charge: c.charge,
        vPrev: c.vPrev
      };
    });

    // 전선 깊은 복사
    const serializedWires = this.wires.map(w => {
      // 미드 포트들 정보 저장
      const midPorts = w.ports
        .filter(p => p.id.startsWith('p_mid_'))
        .map(p => ({ id: p.id, relX: p.relX, relY: p.relY, absX: p.absX, absY: p.absY }));

      return {
        id: w.id,
        type: w.type,
        startX: w.startX,
        startY: w.startY,
        endX: w.endX,
        endY: w.endY,
        resistance: w.resistance,
        midPorts: midPorts
      };
    });

    // 포트 연결 관계 맵 작성
    // 각 포트의 식별자는 "compID/portID"
    const connections = [];
    const collectConnections = (list) => {
      list.forEach(item => {
        item.ports.forEach(port => {
          if (port.connectedTo) {
            connections.push({
              from: `${item.id}/${port.id}`,
              to: `${port.connectedTo.parent.id}/${port.connectedTo.id}`
            });
          }
        });
      });
    };
    collectConnections(this.components);
    collectConnections(this.wires);

    return JSON.stringify({
      components: serializedComponents,
      wires: serializedWires,
      connections: connections,
      namingCounters: { ...this.namingCounters }
    });
  }

  deserializeState(stateStr) {
    if (!stateStr) return;
    const data = JSON.parse(stateStr);

    this.components = [];
    this.wires = [];
    this.namingCounters = data.namingCounters;

    // 컴포넌트 객체 복구
    data.components.forEach(c => {
      let comp = null;
      if (c.type === 'battery') comp = new Battery(c.id, c.x, c.y);
      else if (c.type === 'resistor') comp = new Resistor(c.id, c.x, c.y);
      else if (c.type === 'lightbulb') comp = new Lightbulb(c.id, c.x, c.y);
      else if (c.type === 'capacitor') comp = new Capacitor(c.id, c.x, c.y);
      else if (c.type === 'switch') comp = new Switch(c.id, c.x, c.y);
      else if (c.type === 'transistor') comp = new Transistor(c.id, c.x, c.y);

      if (comp) {
        comp.voltage = c.voltage;
        comp.resistance = c.resistance;
        comp.capacitance = c.capacitance;
        comp.beta = c.beta;
        comp.isOpen = c.isOpen;
        comp.burntOut = c.burntOut;
        comp.brightness = c.brightness;
        comp.charge = c.charge;
        comp.vPrev = c.vPrev;
        this.components.push(comp);
      }
    });

    // 전선 객체 복구
    data.wires.forEach(w => {
      const wire = new Wire(w.id, w.startX, w.startY, w.endX, w.endY);
      wire.resistance = w.resistance;
      // 미드 포트 생성 및 데이터 매핑
      w.midPorts.forEach(mp => {
        const port = wire.addMidPort(mp.absX, mp.absY);
        port.id = mp.id;
        port.relX = mp.relX;
        port.relY = mp.relY;
      });
      this.wires.push(wire);
    });

    // 연결선 매핑
    const findPortByIdStr = (idStr) => {
      const parts = idStr.split('/');
      const parentId = parts[0];
      const portId = parts[1];

      let parent = this.components.find(comp => comp.id === parentId);
      if (!parent) parent = this.wires.find(wire => wire.id === parentId);
      if (parent) {
        return parent.ports.find(p => p.id === portId);
      }
      return null;
    };

    data.connections.forEach(conn => {
      const pFrom = findPortByIdStr(conn.from);
      const pTo = findPortByIdStr(conn.to);
      if (pFrom && pTo) {
        pFrom.connectedTo = pTo;
      }
    });

    this.selectedComponent = null;
    this.selectedWire = null;
    this.draggedComponent = null;
    this.activePort = null;
    this.tempWirePos = null;

    this.triggerUpdate();
  }

  undo() {
    if (this.undoStack.length > 0) {
      const currentState = this.serializeState();
      this.redoStack.push(currentState);
      const prevState = this.undoStack.pop();
      this.deserializeState(prevState);
      this.showToast("↩️ 되돌리기(Undo) 완료");
    } else {
      this.showToast("되돌릴 작업이 없습니다.");
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      const currentState = this.serializeState();
      this.undoStack.push(currentState);
      const nextState = this.redoStack.pop();
      this.deserializeState(nextState);
      this.showToast("🔁 다시 실행(Redo) 완료");
    } else {
      this.showToast("다시 실행할 작업이 없습니다.");
    }
  }

  setupKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          this.undo();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          this.redo();
        }
      }
    });
  }

  setupEvents() {
    this.canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      const rect = this.canvas.getBoundingClientRect();
      // 패닝 보정
      const x = e.clientX - rect.left - this.panX;
      const y = e.clientY - rect.top - this.panY;

      if (type) {
        this.saveHistory();
        this.addComponent(type, x, y);
      }
    });

    const palette = document.getElementById('component-palette');
    palette.querySelectorAll('.comp-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.type);
      });
    });

    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
  }

  // 한글 순번 이름 생성 도우미
  generateKoreanName(type) {
    const koreanMap = {
      battery: '전지',
      resistor: '저항',
      lightbulb: '전구',
      capacitor: '축전기',
      switch: '스위치',
      transistor: '트랜지스터',
      wire: '전선'
    };
    const name = `${koreanMap[type]} ${this.namingCounters[type]}`;
    this.namingCounters[type]++;
    return name;
  }

  addComponent(type, x, y) {
    const name = this.generateKoreanName(type);
    let comp = null;

    if (type === 'battery') comp = new Battery(name, x, y);
    else if (type === 'resistor') comp = new Resistor(name, x, y);
    else if (type === 'lightbulb') comp = new Lightbulb(name, x, y);
    else if (type === 'capacitor') comp = new Capacitor(name, x, y);
    else if (type === 'switch') comp = new Switch(name, x, y);
    else if (type === 'transistor') comp = new Transistor(name, x, y);
    else if (type === 'wire') {
      comp = new Wire(name, x - 50, y, x + 50, y);
      this.wires.push(comp);
      this.triggerUpdate();
      return;
    }

    if (comp) {
      this.components.push(comp);
      this.triggerUpdate();
    }
  }

  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    // 월드 좌표 보정
    const wx = mx - this.panX;
    const wy = my - this.panY;
    
    this.mousePos = { x: mx, y: my };

    if (this.activeTool !== 'none') return;

    if (e.button === 0) { // 좌클릭
      // 1. 포트 클릭 여부 감지
      const port = this.findPortAt(wx, wy);
      if (port) {
        this.activePort = port;
        // 연결된 상대 포트도 함께 기억 (두 접점 동시 드래그용)
        this.linkedPort = port.connectedTo || null;
        this.tempWirePos = { x: mx, y: my }; // 화면 좌표 기준 가이드라인
        return;
      }

      // 2. 부품 클릭 감지 (전선 양끝단 드래그 포함)
      const comp = this.findComponentAt(wx, wy);
      if (comp) {
        if (comp.type === 'wire') {
          this.selectedWire = comp;
          const wirePort = this.findPortAt(wx, wy);
          // 전선 양단 포트 드래그 감지
          if (wirePort && wirePort.parent === comp) {
            this.saveHistory();
            this.activePort = wirePort;
          } else {
            // 전선 몸체 드래그 이동 비활성화 처리: draggedComponent로 설정하지 않음!
            this.selectComponent(null);
          }
        } else {
          this.saveHistory();
          this.draggedComponent = comp;
          this.dragOffsetX = wx - comp.x;
          this.dragOffsetY = wy - comp.y;
          this.selectComponent(comp);
        }
        return;
      }

      // 3. 빈 공간 클릭 시 화이트보드 캔버스 패닝 시작
      this.selectComponent(null);
      this.selectedWire = null;
      this.isPanning = true;
      this.panStartX = mx - this.panX;
      this.panStartY = my - this.panY;
    }
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    
    // 월드 좌표 보정
    const wx = mx - this.panX;
    const wy = my - this.panY;
    
    this.mousePos = { x: mx, y: my };

    // 화이트보드 패닝 처리
    if (this.isPanning) {
      this.panX = mx - this.panStartX;
      this.panY = my - this.panStartY;
      return;
    }

    this.hoveredPort = this.findPortAt(wx, wy);
    this.hoveredComponent = this.findComponentAt(wx, wy);
    if (this.hoveredComponent && this.hoveredComponent.type === 'wire') {
      this.hoveredWire = this.hoveredComponent;
    } else {
      this.hoveredWire = null;
    }

    // 1. 접점에서 드래그하여 연결선을 빼는 중일 때
    if (this.activePort) {
      const wire = this.activePort.parent;
      
      // 1-1. 기존 생성된 전선(Wire)의 마디 접점을 조절하는 중인 경우
      if (wire && wire.type === 'wire') {
        let targetX = wx;
        let targetY = wy;

        // Shift 키 누르면 수평/수직 고정
        if (e.shiftKey) {
          if (this.activePort.id === 'p_start') {
            const dx = targetX - wire.endX;
            const dy = targetY - wire.endY;
            if (Math.abs(dx) > Math.abs(dy)) { targetY = wire.endY; } else { targetX = wire.endX; }
          } else if (this.activePort.id === 'p_end') {
            const dx = targetX - wire.startX;
            const dy = targetY - wire.startY;
            if (Math.abs(dx) > Math.abs(dy)) { targetY = wire.startY; } else { targetX = wire.startX; }
          }
        }

        // 스냅(자석 효과): 드래그 선 끝을 20px 이내의 근접 포트(자기 자신이나 자기가 속한 전선의 포트 제외)로 스냅
        const nearPort = this.findPortAt(targetX, targetY);
        if (nearPort && nearPort !== this.activePort && nearPort.parent !== wire) {
          const np = nearPort.getAbsolutePos();
          targetX = np.x;
          targetY = np.y;
        }

        if (this.activePort.id === 'p_start') {
          wire.updatePoints(targetX, targetY, wire.endX, wire.endY);
        } else if (this.activePort.id === 'p_end') {
          wire.updatePoints(wire.startX, wire.startY, targetX, targetY);
        } else if (this.activePort.id.startsWith('p_mid_')) {
          this.activePort.absX = targetX;
          this.activePort.absY = targetY;
          wire.updatePoints(wire.startX, wire.startY, wire.endX, wire.endY);
        }

        // 연결된 상대 포트(linkedPort)도 같은 위치로 동시 이동
        if (this.linkedPort) {
          const linkedWire = this.linkedPort.parent;
          if (linkedWire && linkedWire.type === 'wire') {
            if (this.linkedPort.id === 'p_start') {
              linkedWire.updatePoints(targetX, targetY, linkedWire.endX, linkedWire.endY);
            } else if (this.linkedPort.id === 'p_end') {
              linkedWire.updatePoints(linkedWire.startX, linkedWire.startY, targetX, targetY);
            } else if (this.linkedPort.id.startsWith('p_mid_')) {
              this.linkedPort.absX = targetX;
              this.linkedPort.absY = targetY;
              linkedWire.updatePoints(linkedWire.startX, linkedWire.startY, linkedWire.endX, linkedWire.endY);
            }
          }
        }

        this.triggerUpdate();
      } 
      
      // 1-2. 일반 부품의 접점(Port)에서 드래그하여 신규 자동 전선을 그리는 과정
      else {
        const startPos = this.activePort.getAbsolutePos();
        let targetX = wx;
        let targetY = wy;

        // Shift 키 누르면 직교 고정
        if (e.shiftKey) {
          const dx = targetX - startPos.x;
          const dy = targetY - startPos.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            targetY = startPos.y;
          } else {
            targetX = startPos.x;
          }
        }

        // 스냅(자석 효과): 드래그 선 끝을 20px 이내의 근접 포트로 스냅
        const nearPort = this.findPortAt(targetX, targetY);
        if (nearPort && nearPort !== this.activePort && nearPort.parent !== this.activePort.parent) {
          const np = nearPort.getAbsolutePos();
          targetX = np.x;
          targetY = np.y;
        }

        // 가이드선 화면 좌표 업데이트
        this.tempWirePos = { x: targetX + this.panX, y: targetY + this.panY };
      }
      return;
    }

    // 2. 부품 드래그 이동 (전선 드래그 이동 불가)
    if (this.draggedComponent && this.draggedComponent.type !== 'wire') {
      const comp = this.draggedComponent;
      const oldX = comp.x;
      const oldY = comp.y;
      
      comp.x = wx - this.dragOffsetX;
      comp.y = wy - this.dragOffsetY;

      // 부품이 이동할 때, 해당 부품의 각 Port에 연결(connectedTo)된 전선의 끝점을 실시간으로 따라오게 갱신
      comp.ports.forEach(port => {
        // 이 포트에 연결되어 있는 다른 포트들 찾기
        // (일반적으로 다른 컴포넌트의 포트나 전선의 포트)
        const checkFollow = (item) => {
          item.ports.forEach(p => {
            if (p.connectedTo === port) {
              // p가 전선의 포트(p_start / p_end)인 경우 전선의 끝점 좌표 갱신
              if (item.type === 'wire') {
                const absPos = port.getAbsolutePos();
                if (p.id === 'p_start') {
                  item.updatePoints(absPos.x, absPos.y, item.endX, item.endY);
                } else if (p.id === 'p_end') {
                  item.updatePoints(item.startX, item.startY, absPos.x, absPos.y);
                }
              }
            }
          });
        };
        this.wires.forEach(checkFollow);
        this.components.forEach(checkFollow);
      });

      this.triggerUpdate();
      return;
    }

    if (this.activeTool !== 'none') {
      this.updateMeasurement();
    }
  }

  handleMouseUp(e) {
    const rect = this.canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    
    // 월드 좌표 보정
    const wx = mx - this.panX;
    const wy = my - this.panY;

    this.isPanning = false;

    // 접점 드래그하여 마우스 뗐을 때 자동 전선 생성
    if (this.activePort && this.tempWirePos) {
      // 뗐을 때 위치의 스냅 좌표 반영
      let snapX = wx;
      let snapY = wy;
      
      const targetPort = this.findPortAt(wx, wy);
      if (targetPort && targetPort !== this.activePort && targetPort.parent !== this.activePort.parent) {
        const np = targetPort.getAbsolutePos();
        snapX = np.x;
        snapY = np.y;
      }

      // 자신과 다른 부품의 접점에 도달했을 때만 전선 자동 빌드
      if (targetPort && targetPort !== this.activePort && targetPort.parent !== this.activePort.parent) {
        this.saveHistory();
        const startPos = this.activePort.getAbsolutePos();

        // 뗐을 때 최종 Shift 정렬 적용
        if (e.shiftKey) {
          const dx = snapX - startPos.x;
          const dy = snapY - startPos.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            snapY = startPos.y;
          } else {
            snapX = startPos.x;
          }
        }

        // 새로운 전선(Wire) 인스턴스 자동 생성
        const wireName = this.generateKoreanName('wire');
        const newWire = new Wire(wireName, startPos.x, startPos.y, snapX, snapY);
        
        // 새로 생성된 전선 양끝을 드래그 소스/타겟 포트와 전기적으로 완전 결합
        newWire.ports[0].connectedTo = this.activePort;
        newWire.ports[1].connectedTo = targetPort;

        this.wires.push(newWire);
        this.playSnapSound();
        this.showToast("⚡ 전선이 자동으로 연결되어 배치되었습니다.");
      }
    }

    this.activePort = null;
    this.tempWirePos = null;
    this.linkedPort = null;
    this.draggedComponent = null;

    this.triggerUpdate();
  }

  handleDoubleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = mx - this.panX;
    const wy = my - this.panY;

    // 1. 전선 더블 클릭 시 분기 접점 생성 (기존 전선 삭제 및 2개의 신규 전선 생성)
    const wire = this.findWireAt(wx, wy);
    if (wire) {
      this.saveHistory();

      const startX = wire.startX;
      const startY = wire.startY;
      const endX = wire.endX;
      const endY = wire.endY;

      const pStartConn = wire.ports[0].connectedTo;
      const pEndConn = wire.ports[1].connectedTo;

      // 기존 전선 삭제
      this.deleteComponent(wire);

      // 2개의 신규 전선 생성
      const w1Name = this.generateKoreanName('wire');
      const w2Name = this.generateKoreanName('wire');

      // wx, wy는 새로운 분기 접점 위치
      const wire1 = new Wire(w1Name, startX, startY, wx, wy);
      const wire2 = new Wire(w2Name, wx, wy, endX, endY);

      // 기존 연결 복구
      if (pStartConn) {
        wire1.ports[0].connectedTo = pStartConn;
        pStartConn.connectedTo = wire1.ports[0];
      }
      if (pEndConn) {
        wire2.ports[1].connectedTo = pEndConn;
        pEndConn.connectedTo = wire2.ports[1];
      }

      // 두 전선의 맞닿은 중간 접점을 전기적으로 결합
      wire1.ports[1].connectedTo = wire2.ports[0];
      wire2.ports[0].connectedTo = wire1.ports[1];

      this.wires.push(wire1, wire2);

      this.showToast("⚡ 전선이 분기 분할되었습니다.");
      this.triggerUpdate();
      return;
    }

    const comp = this.findComponentAt(wx, wy);
    if (comp) {
      if (comp.type === 'switch') {
        this.saveHistory();
        comp.isOpen = !comp.isOpen;
        this.showToast(comp.isOpen ? "스위치가 열렸습니다 (OFF)" : "스위치가 닫혔습니다 (ON)");
        this.triggerUpdate();
      } else {
        this.showParameterModal(comp);
      }
    }
  }

  handleContextMenu(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = mx - this.panX;
    const wy = my - this.panY;

    // 1. 접점(Port) 우클릭 시 연결 끊기 및 30px 밀어내기 처리
    const port = this.findPortAt(wx, wy);
    if (port) {
      this.saveHistory();
      
      let disconnected = false;
      const processDisconnect = (p) => {
        if (p.connectedTo) {
          const other = p.connectedTo;
          p.connectedTo = null;
          other.connectedTo = null;
          
          // 전선일 경우 끝점 위치를 30px 옆으로 밀어냄
          if (p.parent.type === 'wire') {
            const wire = p.parent;
            if (p.id === 'p_start') {
              wire.updatePoints(wire.startX - 30, wire.startY, wire.endX, wire.endY);
            } else if (p.id === 'p_end') {
              wire.updatePoints(wire.startX, wire.startY, wire.endX + 30, wire.endY);
            }
          }
          if (other.parent.type === 'wire') {
            const wire = other.parent;
            if (other.id === 'p_start') {
              wire.updatePoints(wire.startX - 30, wire.startY, wire.endX, wire.endY);
            } else if (other.id === 'p_end') {
              wire.updatePoints(wire.startX, wire.startY, wire.endX + 30, wire.endY);
            }
          }
          disconnected = true;
        }
      };

      processDisconnect(port);
      
      if (disconnected) {
        this.showToast("🔌 전선 연결이 해제되었습니다.");
        this.triggerUpdate();
        return;
      }
    }

    // 2. 부품 몸체 우클릭 시에만 삭제 처리
    const comp = this.findComponentAt(wx, wy);
    if (comp) {
      this.saveHistory();
      this.deleteComponent(comp);
      this.showToast("부품이 삭제되었습니다.");
    }
  }

  selectComponent(comp) {
    if (this.selectedComponent) {
      this.selectedComponent.isSelected = false;
    }
    this.selectedComponent = comp;
    if (comp) {
      comp.isSelected = true;
    }
  }

  deleteComponent(comp) {
    comp.ports.forEach(p => {
      this.components.forEach(c => {
        c.ports.forEach(op => {
          if (op.connectedTo === p) op.connectedTo = null;
        });
      });
      this.wires.forEach(w => {
        w.ports.forEach(op => {
          if (op.connectedTo === p) op.connectedTo = null;
        });
      });
    });

    if (comp.type === 'wire') {
      this.wires = this.wires.filter(w => w !== comp);
    } else {
      this.components = this.components.filter(c => c !== comp);
    }

    if (this.selectedComponent === comp) {
      this.selectedComponent = null;
    }
    this.triggerUpdate();
  }

  findPortAt(x, y) {
    const clickRadius = 16;
    
    for (const comp of this.components) {
      for (const port of comp.ports) {
        const pos = port.getAbsolutePos();
        const dist = Math.hypot(pos.x - x, pos.y - y);
        if (dist <= clickRadius) return port;
      }
    }

    for (const wire of this.wires) {
      for (const port of wire.ports) {
        const pos = port.getAbsolutePos();
        const dist = Math.hypot(pos.x - x, pos.y - y);
        if (dist <= clickRadius) return port;
      }
    }

    return null;
  }

  findComponentAt(x, y) {
    for (const comp of this.components) {
      if (comp.containsPoint(x, y)) return comp;
    }
    for (const wire of this.wires) {
      if (wire.containsPoint(x, y)) return wire;
    }
    return null;
  }

  findWireAt(x, y) {
    for (const wire of this.wires) {
      if (wire.containsPoint(x, y)) return wire;
    }
    return null;
  }

  triggerUpdate() {
    this.engine.solve(this.components, this.wires);
  }

  showParameterModal(comp) {
    const modal = document.getElementById('parameter-modal');
    const title = document.getElementById('modal-title');
    const label = document.getElementById('param-label');
    const slider = document.getElementById('param-slider');
    const input = document.getElementById('param-input');
    const minText = document.getElementById('param-min');
    const maxText = document.getElementById('param-max');
    const saveBtn = document.getElementById('btn-save-param');

    modal.classList.remove('hidden');
    title.textContent = `${comp.id} 설정`;

    let min = 0, max = 100, val = 0, step = 1;
    let unit = "";

    if (comp.type === 'battery') {
      label.textContent = "전압 (V):";
      min = 0; max = 50; step = 0.5;
      val = comp.voltage;
      unit = "V";
    } else if (comp.type === 'resistor' || comp.type === 'lightbulb') {
      label.textContent = "저항 (Ω):";
      min = 1; max = 500; step = 1;
      val = comp.resistance;
      unit = "Ω";
    } else if (comp.type === 'capacitor') {
      label.textContent = "정전용량 (µF):";
      min = 10; max = 1000; step = 10;
      val = comp.capacitance;
      unit = "µF";
    } else if (comp.type === 'transistor') {
      label.textContent = "전류 증폭률 (β):";
      min = 10; max = 300; step = 5;
      val = comp.beta;
      unit = "";
    }

    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = val;

    input.min = min;
    input.max = max;
    input.step = step;
    input.value = val;

    minText.textContent = `${min}${unit}`;
    maxText.textContent = `${max}${unit}`;

    const syncValues = (v) => {
      slider.value = v;
      input.value = v;
    };
    slider.oninput = (e) => syncValues(e.target.value);
    input.oninput = (e) => syncValues(e.target.value);

    saveBtn.onclick = () => {
      const finalVal = parseFloat(input.value);
      if (!isNaN(finalVal)) {
        this.saveHistory();
        if (comp.type === 'battery') comp.voltage = finalVal;
        else if (comp.type === 'resistor' || comp.type === 'lightbulb') comp.resistance = finalVal;
        else if (comp.type === 'capacitor') {
          comp.capacitance = finalVal;
          comp.charge = 0;
          comp.voltage = 0;
          comp.vPrev = 0;
        }
        else if (comp.type === 'transistor') comp.beta = finalVal;

        this.triggerUpdate();
        modal.classList.add('hidden');
        this.showToast("설정이 성공적으로 적용되었습니다.");
      }
    };

    document.getElementById('modal-close').onclick = () => {
      modal.classList.add('hidden');
    };
  }

  setTool(toolName) {
    this.activeTool = toolName;
    const meter = document.getElementById('meter-display');
    const title = document.getElementById('meter-title');

    if (toolName === 'none') {
      meter.classList.add('hidden');
    } else {
      meter.classList.remove('hidden');
      title.textContent = toolName === 'voltmeter' ? '📊 전압계' : '📈 전류계';
      this.updateMeasurement();
    }
  }

  updateMeasurement() {
    const meterVal = document.querySelector('.meter-value');
    const meterFooter = document.querySelector('.meter-footer');
    
    // 월드 좌표 보정
    const wx = this.mousePos.x - this.panX;
    const wy = this.mousePos.y - this.panY;

    if (this.activeTool === 'voltmeter') {
      meterFooter.textContent = "접점을 클릭/대면 GND(0V) 기준 전압이 측정됩니다.";
      if (this.hoveredPort) {
        const v = this.engine.getNodeVoltage(this.hoveredPort.nodeIndex);
        meterVal.textContent = `${v.toFixed(3)} V`;
        meterVal.style.color = '#10b981';
      } else {
        meterVal.textContent = "--- V";
      }
    } else if (this.activeTool === 'ammeter') {
      meterFooter.textContent = "소자/도선 위에 대면 통과 전류가 실시간 측정됩니다.";
      if (this.hoveredComponent) {
        const i = this.hoveredComponent.current || 0;
        meterVal.textContent = `${(i * 1000).toFixed(1)} mA`;
        meterVal.style.color = '#2563eb';
      } else {
        meterVal.textContent = "--- mA";
      }
    }
  }

  showToast(msg) {
    const toast = document.getElementById('toast-message');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  drawAll() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    // 패닝 트랜스폼 적용
    this.ctx.translate(this.panX, this.panY);

    this.drawPortConnections();

    // 2. 전선 드로잉
    this.wires.forEach(wire => {
      if (this.hoveredWire === wire || this.selectedWire === wire) {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(37, 99, 235, 0.18)';
        this.ctx.lineWidth = 14;
        this.ctx.beginPath();
        this.ctx.moveTo(wire.startX, wire.startY);
        this.ctx.lineTo(wire.endX, wire.endY);
        this.ctx.stroke();
        this.ctx.restore();
      }
      wire.draw(this.ctx);
    });

    // 3. 소자 드로잉
    this.components.forEach(comp => {
      comp.draw(this.ctx);
    });

    // 4. 네온 입자 렌더링
    this.updateAndDrawParticles();

    this.ctx.restore();

    // --- 패닝과 별도로 화면 기준 드로잉하는 요소들 ---
    
    // 5. 접점 간 드래그 임시 점선 (tempWirePos는 화면 좌표 기준)
    if (this.activePort && this.tempWirePos) {
      const startWorld = this.activePort.getAbsolutePos();
      const startScreenX = startWorld.x + this.panX;
      const startScreenY = startWorld.y + this.panY;
      
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(37, 99, 235, 0.7)';
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([6, 6]);
      this.ctx.beginPath();
      this.ctx.moveTo(startScreenX, startScreenY);
      this.ctx.lineTo(this.tempWirePos.x, this.tempWirePos.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 6. 멀티미터 리드봉
    this.drawMeasurementToolProbe();
  }

  drawPortConnections() {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    this.ctx.lineWidth = 3.5;

    const allPorts = [];
    this.components.forEach(c => allPorts.push(...c.ports));
    this.wires.forEach(w => allPorts.push(...w.ports));

    allPorts.forEach(port => {
      if (port.connectedTo) {
        const posA = port.getAbsolutePos();
        const posB = port.connectedTo.getAbsolutePos();
        
        this.ctx.beginPath();
        this.ctx.moveTo(posA.x, posA.y);
        this.ctx.lineTo(posB.x, posB.y);
        this.ctx.stroke();
      }
    });
    this.ctx.restore();
  }

  // 전류 및 전자 이동 파티클 렌더링
  updateAndDrawParticles() {
    const isElectron = this.visualMode === 'electron';
    
    this.ctx.save();
    this.ctx.fillStyle = isElectron ? '#7c3aed' : '#2563eb';
    this.ctx.shadowBlur = 6;
    this.ctx.shadowColor = isElectron ? '#c084fc' : '#60a5fa';

    // 전선(Wires) 파티클
    this.wires.forEach(wire => {
      const current = wire.current || 0.0;
      if (Math.abs(current) < 1e-4) return;

      const speed = Math.min(8, Math.abs(current) * 3);
      const direction = isElectron ? (current < 0 ? 1 : -1) : (current > 0 ? 1 : -1);

      const dx = wire.endX - wire.startX;
      const dy = wire.endY - wire.startY;
      const len = Math.hypot(dx, dy);
      
      const spacing = 32;
      const numParticles = Math.floor(len / spacing);
      const timeShift = (Date.now() * 0.05 * speed * direction) % spacing;

      for (let i = 0; i <= numParticles; i++) {
        let offset = (i * spacing + timeShift);
        if (offset < 0) offset += spacing * 20;
        offset = offset % len;

        const px = wire.startX + (dx / len) * offset;
        const py = wire.startY + (dy / len) * offset;

        this.ctx.beginPath();
        this.ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    // 일반 소자 내부의 파티클 렌더링
    this.components.forEach(comp => {
      if (comp.type === 'wire') return;
      const current = comp.current || 0;
      if (Math.abs(current) < 1e-4) return;

      const R = comp.resistance || 1.0;
      const isResistor = comp.type === 'resistor' || comp.type === 'lightbulb';
      
      const speed = Math.max(0.4, Math.min(4, Math.abs(current) * 2 / (isResistor ? Math.sqrt(R) : 1)));
      const direction = isElectron ? (current < 0 ? 1 : -1) : (current > 0 ? 1 : -1);

      const p1 = comp.ports[0].getAbsolutePos();
      const p2 = comp.ports[1].getAbsolutePos();
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);

      const spacing = isResistor ? 14 : 30;
      const numParticles = Math.floor(len / spacing);
      const timeShift = (Date.now() * 0.04 * speed * direction) % spacing;

      for (let i = 0; i <= numParticles; i++) {
        let offset = (i * spacing + timeShift);
        if (offset < 0) offset += spacing * 10;
        offset = offset % len;

        const px = p1.x + (dx / len) * offset;
        const py = p1.y + (dy / len) * offset;

        this.ctx.beginPath();
        this.ctx.arc(px, py, isResistor ? 2.2 : 3.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    this.ctx.restore();
  }

  drawMeasurementToolProbe() {
    if (this.activeTool === 'none') return;

    this.ctx.save();
    
    const mx = this.mousePos.x;
    const my = this.mousePos.y;

    this.ctx.strokeStyle = this.activeTool === 'voltmeter' ? '#10b981' : '#2563eb';
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = 'round';
    
    this.ctx.beginPath();
    this.ctx.moveTo(mx, my);
    this.ctx.lineTo(mx + 20, my - 30);
    this.ctx.stroke();

    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 8;
    this.ctx.beginPath();
    this.ctx.moveTo(mx + 16, my - 24);
    this.ctx.lineTo(mx + 36, my - 54);
    this.ctx.stroke();

    this.ctx.fillStyle = this.activeTool === 'voltmeter' ? '#10b981' : '#2563eb';
    this.ctx.beginPath();
    this.ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  resetCanvas() {
    this.components = [];
    this.wires = [];
    this.draggedComponent = null;
    this.activePort = null;
    this.tempWirePos = null;
    this.selectedComponent = null;
    this.selectedWire = null;
    this.namingCounters = {
      battery: 1,
      resistor: 1,
      lightbulb: 1,
      capacitor: 1,
      switch: 1,
      transistor: 1,
      wire: 1
    };
    this.panX = 0;
    this.panY = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.engine.resetStates([], []);
  }
}

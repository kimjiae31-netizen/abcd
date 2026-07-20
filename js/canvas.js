// 회로 캔버스 렌더링 및 마우스 인터랙션 처리 (자동 전선 생성 및 Shift 고정 지원)

import { Battery, Resistor, Lightbulb, Capacitor, Switch, Transistor, Wire } from './components.js';

export class CircuitCanvas {
  constructor(canvasId, engine) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.engine = engine;

    this.components = [];
    this.wires = [];

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

    // 컴포넌트 한글 순번 생성 카운터 (main.js와 동기화를 돕기 위해)
    this.namingCounters = {
      battery: 1,
      resistor: 1,
      lightbulb: 1,
      capacitor: 1,
      switch: 1,
      transistor: 1,
      wire: 1
    };

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.setupEvents();
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  setVisualMode(mode) {
    this.visualMode = mode;
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
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (type) {
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
    this.mousePos = { x: mx, y: my };

    if (this.activeTool !== 'none') return;

    // 1. 포트 클릭 여부 감지
    const port = this.findPortAt(mx, my);
    if (port) {
      this.activePort = port;
      this.tempWirePos = { x: mx, y: my };
      return;
    }

    // 2. 부품 드래그 감지
    const comp = this.findComponentAt(mx, my);
    if (comp) {
      if (comp.type === 'wire') {
        this.selectedWire = comp;
        const wirePort = this.findPortAt(mx, my);
        // 전선 양단 포트 드래그 감지
        if (wirePort && wirePort.parent === comp) {
          this.activePort = wirePort;
        } else {
          this.draggedComponent = comp;
          this.dragOffsetX = mx - comp.x;
          this.dragOffsetY = my - comp.y;
        }
      } else {
        this.draggedComponent = comp;
        this.dragOffsetX = mx - comp.x;
        this.dragOffsetY = my - comp.y;
        this.selectComponent(comp);
      }
      return;
    }

    this.selectComponent(null);
    this.selectedWire = null;
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    this.mousePos = { x: mx, y: my };

    this.hoveredPort = this.findPortAt(mx, my);
    this.hoveredComponent = this.findComponentAt(mx, my);
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
        if (this.activePort.id === 'p_start') {
          let startX = mx, startY = my;
          // Shift 키 누르면 수평/수직 고정
          if (e.shiftKey) {
            const dx = startX - wire.endX;
            const dy = startY - wire.endY;
            if (Math.abs(dx) > Math.abs(dy)) { startY = wire.endY; } else { startX = wire.endX; }
          }
          wire.updatePoints(startX, startY, wire.endX, wire.endY);
        } 
        else if (this.activePort.id === 'p_end') {
          let endX = mx, endY = my;
          if (e.shiftKey) {
            const dx = endX - wire.startX;
            const dy = endY - wire.startY;
            if (Math.abs(dx) > Math.abs(dy)) { endY = wire.startY; } else { endX = wire.startX; }
          }
          wire.updatePoints(wire.startX, wire.startY, endX, endY);
        }
        else if (this.activePort.id.startsWith('p_mid_')) {
          this.activePort.absX = mx;
          this.activePort.absY = my;
          wire.updatePoints(wire.startX, wire.startY, wire.endX, wire.endY);
        }
        this.triggerUpdate();
      } 
      
      // 1-2. 일반 부품의 접점(Port)에서 드래그하여 신규 자동 전선을 그리는 과정
      else {
        const startPos = this.activePort.getAbsolutePos();
        // Shift 키 누르면 직교 고정
        if (e.shiftKey) {
          const dx = mx - startPos.x;
          const dy = my - startPos.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            my = startPos.y;
          } else {
            mx = startPos.x;
          }
        }
        this.tempWirePos = { x: mx, y: my };
      }
      return;
    }

    // 2. 부품 드래그 이동
    if (this.draggedComponent) {
      const comp = this.draggedComponent;
      if (comp.type === 'wire') {
        const dx = mx - comp.x - this.dragOffsetX;
        const dy = my - comp.y - this.dragOffsetY;
        comp.updatePoints(comp.startX + dx, comp.startY + dy, comp.endX + dx, comp.endY + dy);
      } else {
        comp.x = mx - this.dragOffsetX;
        comp.y = my - this.dragOffsetY;
      }
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

    // 접점 드래그하여 마우스 뗐을 때 자동 전선 생성
    if (this.activePort && this.tempWirePos) {
      const targetPort = this.findPortAt(mx, my);

      // 자신과 다른 부품의 접점에 도달했을 때만 전선 자동 빌드
      if (targetPort && targetPort !== this.activePort && targetPort.parent !== this.activePort.parent) {
        const startPos = this.activePort.getAbsolutePos();
        let endPos = targetPort.getAbsolutePos();

        // 뗐을 때 최종 Shift 정렬 적용
        if (e.shiftKey) {
          const dx = mx - startPos.x;
          const dy = my - startPos.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            endPos.y = startPos.y;
          } else {
            endPos.x = startPos.x;
          }
        }

        // 새로운 전선(Wire) 인스턴스 자동 생성
        const wireName = this.generateKoreanName('wire');
        const newWire = new Wire(wireName, startPos.x, startPos.y, endPos.x, endPos.y);
        
        // 새로 생성된 전선 양끝을 드래그 소스/타겟 포트와 전기적으로 완전 결합
        newWire.ports[0].connectedTo = this.activePort;
        newWire.ports[1].connectedTo = targetPort;

        this.wires.push(newWire);
        this.showToast("⚡ 전선이 자동으로 연결되어 배치되었습니다.");
      }
    }

    this.activePort = null;
    this.tempWirePos = null;
    this.draggedComponent = null;

    this.triggerUpdate();
  }

  handleDoubleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const comp = this.findComponentAt(mx, my);
    if (comp) {
      if (comp.type === 'switch') {
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

    if (e.shiftKey) {
      const wire = this.findWireAt(mx, my);
      if (wire) {
        wire.addMidPort(mx, my);
        this.showToast("전선에 분기 접점이 생성되었습니다.");
        this.triggerUpdate();
        return;
      }
    }

    const comp = this.findComponentAt(mx, my);
    if (comp) {
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
    const clickRadius = 16; // 포트 크기 확대에 맞춰 클릭 반경 16px로 확대
    
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

    // 1. 접점 간 드래그로 그리는 임시 연결 점선 가시화
    if (this.activePort && this.tempWirePos) {
      const start = this.activePort.getAbsolutePos();
      this.ctx.save();
      // 밝은 캔버스에 잘 보이는 진한 파란색 점선 적용
      this.ctx.strokeStyle = 'rgba(37, 99, 235, 0.7)';
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([6, 6]);
      this.ctx.beginPath();
      this.ctx.moveTo(start.x, start.y);
      this.ctx.lineTo(this.tempWirePos.x, this.tempWirePos.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

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

    // 4. 회하늘색 밝은 배경에서 훌륭히 잘 보이는 네온 입자 렌더링
    this.updateAndDrawParticles();

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

  // 전류(양전하) 및 전자 이동 파티클 렌더링 (전선 저항 연산 반영 완성)
  updateAndDrawParticles() {
    const isElectron = this.visualMode === 'electron';
    
    this.ctx.save();
    
    // 밝은 배경 대비 입자 색상
    // 전류: 진한 청색 (#1d4ed8), 전자: 자색 (#6d28d9)
    this.ctx.fillStyle = isElectron ? '#7c3aed' : '#2563eb';
    this.ctx.shadowBlur = 6;
    this.ctx.shadowColor = isElectron ? '#c084fc' : '#60a5fa';

    // 전선(Wires) 파티클 - 전선을 흐르는 미세 전류(wire.current) 데이터를 정확히 수치 기반 처리
    this.wires.forEach(wire => {
      const current = wire.current || 0.0;
      if (Math.abs(current) < 1e-4) return;

      // 속도 및 방향 계산
      const speed = Math.min(8, Math.abs(current) * 3);
      const direction = isElectron ? (current < 0 ? 1 : -1) : (current > 0 ? 1 : -1);

      const dx = wire.endX - wire.startX;
      const dy = wire.endY - wire.startY;
      const len = Math.hypot(dx, dy);
      
      const spacing = 32; // 입자 간격 32px
      const numParticles = Math.floor(len / spacing);
      const timeShift = (Date.now() * 0.05 * speed * direction) % spacing;

      for (let i = 0; i <= numParticles; i++) {
        let offset = (i * spacing + timeShift);
        if (offset < 0) offset += spacing * 20;
        offset = offset % len;

        const px = wire.startX + (dx / len) * offset;
        const py = wire.startY + (dy / len) * offset;

        this.ctx.beginPath();
        this.ctx.arc(px, py, 3.5, 0, Math.PI * 2); // 파티클 크기 확대
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
      
      // 저항소자 내부에서는 ... 느낌으로 촘촘히 천천히 가도록 속도 조절
      const speed = Math.max(0.4, Math.min(4, Math.abs(current) * 2 / (isResistor ? Math.sqrt(R) : 1)));
      const direction = isElectron ? (current < 0 ? 1 : -1) : (current > 0 ? 1 : -1);

      const p1 = comp.ports[0].getAbsolutePos();
      const p2 = comp.ports[1].getAbsolutePos();
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);

      const spacing = isResistor ? 14 : 30; // 저항 내부 입자는 14px로 매우 조밀
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
    this.engine.resetStates([], []);
  }
}

// 메인 실행 및 이벤트 연동 스크립트 (1.5배 확대 좌표 및 한글 순번 이름 템플릿 지원)

import { CircuitEngine } from './engine.js';
import { CircuitCanvas } from './canvas.js';
import { BlockCodingEditor } from './blocks.js';
import { OscilloscopeGraph } from './graph.js';
import { Battery, Resistor, Lightbulb, Capacitor, Switch, Transistor, Wire } from './components.js';

document.addEventListener('DOMContentLoaded', () => {
  const engine = new CircuitEngine();
  const canvas = new CircuitCanvas('circuit-canvas', engine);
  const blocks = new BlockCodingEditor(canvas);
  const graph = new OscilloscopeGraph('graph-canvas');

  let simSpeed = 1.0;

  // UI 이벤트 바인딩
  const btnCurrent = document.getElementById('btn-visual-current');
  const btnElectron = document.getElementById('btn-visual-electron');

  btnCurrent.onclick = () => {
    btnCurrent.classList.add('active');
    btnElectron.classList.remove('active');
    canvas.setVisualMode('current');
  };

  btnElectron.onclick = () => {
    btnElectron.classList.add('active');
    btnCurrent.classList.remove('active');
    canvas.setVisualMode('electron');
  };

  const speedSlider = document.getElementById('speed-slider');
  speedSlider.oninput = (e) => {
    simSpeed = parseFloat(e.target.value);
  };

  const btnVoltmeter = document.getElementById('btn-tool-voltmeter');
  const btnAmmeter = document.getElementById('btn-tool-ammeter');
  const btnCloseMeter = document.getElementById('btn-close-meter');

  const selectTool = (tool) => {
    if (canvas.activeTool === tool) {
      canvas.setTool('none');
      btnVoltmeter.classList.remove('active');
      btnAmmeter.classList.remove('active');
      graph.setTarget(null, 'voltage');
    } else {
      canvas.setTool(tool);
      if (tool === 'voltmeter') {
        btnVoltmeter.classList.add('active');
        btnAmmeter.classList.remove('active');
        graph.setTarget(null, 'voltage');
      } else {
        btnAmmeter.classList.add('active');
        btnVoltmeter.classList.remove('active');
        graph.setTarget(null, 'current');
      }
    }
  };

  btnVoltmeter.onclick = () => selectTool('voltmeter');
  btnAmmeter.onclick = () => selectTool('ammeter');
  btnCloseMeter.onclick = () => selectTool('none');

  const btnClearGraph = document.getElementById('btn-clear-graph');
  const graphSourceSelect = document.getElementById('graph-source-select');

  btnClearGraph.onclick = () => graph.clear();

  const updateGraphSourceDropdown = () => {
    const prevVal = graphSourceSelect.value;
    graphSourceSelect.innerHTML = '<option value="none">선택되지 않음 (측정기 연결 필요)</option>';
    
    canvas.components.forEach(comp => {
      if (comp.type !== 'wire') {
        graphSourceSelect.innerHTML += `<option value="comp:${comp.id}">${comp.id} (양단 전압/전류)</option>`;
      }
    });
    
    if (prevVal && graphSourceSelect.querySelector(`option[value="${prevVal}"]`)) {
      graphSourceSelect.value = prevVal;
    } else {
      graphSourceSelect.value = 'none';
    }
  };

  graphSourceSelect.onchange = (e) => {
    const val = e.target.value;
    if (val === 'none') {
      graph.setTarget(null, 'voltage');
    } else if (val.startsWith('comp:')) {
      const id = val.split(':')[1];
      const comp = canvas.components.find(c => c.id === id);
      const mode = canvas.activeTool === 'ammeter' ? 'current' : 'voltage';
      graph.setTarget(comp, mode);
    }
  };

  const btnReset = document.getElementById('btn-reset');
  btnReset.onclick = () => {
    canvas.resetCanvas();
    blocks.stopScript();
    blocks.checkPlaceholder();
    graph.clear();
    graph.setTarget(null, 'voltage');
    updateGraphSourceDropdown();
    canvas.showToast("실험실이 완전히 리셋되었습니다.");
  };

  const templateSelect = document.getElementById('template-select');
  templateSelect.onchange = (e) => {
    loadTemplate(e.target.value);
    templateSelect.value = "";
  };

  // 예제 템플릿 빌드 로직 (1.5배 확대 크기 좌표 조율 완료)
  const loadTemplate = (name) => {
    canvas.resetCanvas();
    blocks.stopScript();
    graph.clear();

    canvas.panX = 0;
    canvas.panY = 0;

    const w = canvas.canvas.width;
    const h = canvas.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    if (name === 'basic-circuit') {
      // 1. 기본 직렬 회로 (Battery 1개, bulb 1개, Resistor 1개)
      const batName = canvas.generateKoreanName('battery'); // "전지 1"
      const bulbName = canvas.generateKoreanName('lightbulb'); // "전구 1"
      const resName = canvas.generateKoreanName('resistor'); // "저항 1"

      const bat = new Battery(batName, cx - 220, cy - 100);
      bat.voltage = 9.0;
      
      const bulb = new Lightbulb(bulbName, cx + 220, cy - 100);
      bulb.resistance = 10.0;
      
      const res = new Resistor(resName, cx, cy + 120);
      res.resistance = 10.0;

      canvas.components.push(bat, bulb, res);

      // 전선 생성 (1.5배 스케일에 맞춘 좌표 연결)
      const w1Name = canvas.generateKoreanName('wire');
      const w1 = new Wire(w1Name, cx - 160, cy - 100, cx + 175, cy - 100);
      
      const w2Name = canvas.generateKoreanName('wire');
      const w2 = new Wire(w2Name, cx + 265, cy - 100, cx + 60, cy + 120);
      
      const w3Name = canvas.generateKoreanName('wire');
      const w3 = new Wire(w3Name, cx - 60, cy + 120, cx - 280, cy - 100);

      canvas.wires.push(w1, w2, w3);

      // 포트 접합
      w1.ports[0].connectedTo = bat.ports[1]; // +
      w1.ports[1].connectedTo = bulb.ports[0]; // A
      w2.ports[0].connectedTo = bulb.ports[1]; // B
      w2.ports[1].connectedTo = res.ports[1]; // B
      w3.ports[0].connectedTo = res.ports[0]; // A
      w3.ports[1].connectedTo = bat.ports[0]; // -

      canvas.showToast("💡 기본 전구 직렬 회로가 로드되었습니다.");
    }
    
    else if (name === 'parallel-circuit') {
      // 2. 병렬 저항 회로 (Battery 1개, Resistor 2개 병렬)
      const batName = canvas.generateKoreanName('battery');
      const res1Name = canvas.generateKoreanName('resistor');
      const res2Name = canvas.generateKoreanName('resistor');

      const bat = new Battery(batName, cx - 260, cy);
      bat.voltage = 12.0;

      const res1 = new Resistor(res1Name, cx + 20, cy - 100);
      res1.resistance = 10.0;

      const res2 = new Resistor(res2Name, cx + 20, cy + 100);
      res2.resistance = 20.0;

      canvas.components.push(bat, res1, res2);

      // 버스 분기 와이어 설계
      const wLeft = new Wire(canvas.generateKoreanName('wire'), cx - 120, cy - 100, cx - 120, cy + 100);
      const wRight = new Wire(canvas.generateKoreanName('wire'), cx + 160, cy - 100, cx + 160, cy + 100);

      const w1 = new Wire(canvas.generateKoreanName('wire'), cx - 200, cy, cx - 120, cy); 
      const w2 = new Wire(canvas.generateKoreanName('wire'), cx - 120, cy - 100, cx - 40, cy - 100); 
      const w3 = new Wire(canvas.generateKoreanName('wire'), cx - 120, cy + 100, cx - 40, cy + 100); 

      const w4 = new Wire(canvas.generateKoreanName('wire'), cx + 80, cy - 100, cx + 160, cy - 100); 
      const w5 = new Wire(canvas.generateKoreanName('wire'), cx + 80, cy + 100, cx + 160, cy + 100); 
      const w6 = new Wire(canvas.generateKoreanName('wire'), cx + 160, cy, cx - 320, cy); 

      canvas.wires.push(wLeft, wRight, w1, w2, w3, w4, w5, w6);

      // 접합 매핑
      w1.ports[0].connectedTo = bat.ports[1]; // +
      w1.ports[1].connectedTo = wLeft.ports[0];
      w2.ports[0].connectedTo = wLeft.ports[0];
      w2.ports[1].connectedTo = res1.ports[0]; // A
      w3.ports[0].connectedTo = wLeft.ports[1];
      w3.ports[1].connectedTo = res2.ports[0]; // A

      w4.ports[0].connectedTo = res1.ports[1]; // B
      w4.ports[1].connectedTo = wRight.ports[0];
      w5.ports[0].connectedTo = res2.ports[1]; // B
      w5.ports[1].connectedTo = wRight.ports[1];
      
      w6.ports[0].connectedTo = wRight.ports[0];
      w6.ports[1].connectedTo = bat.ports[0]; // -

      canvas.showToast("📊 병렬 회로가 로드되었습니다.");
    }
    
    else if (name === 'rc-circuit') {
      // 3. 축전기 RC 충방전 회로
      const batName = canvas.generateKoreanName('battery');
      const swName = canvas.generateKoreanName('switch');
      const resName = canvas.generateKoreanName('resistor');
      const capName = canvas.generateKoreanName('capacitor');

      const bat = new Battery(batName, cx - 260, cy - 140);
      bat.voltage = 9.0;

      const sw = new Switch(swName, cx - 20, cy - 120);
      sw.isOpen = true;

      const res = new Resistor(resName, cx + 120, cy);
      res.resistance = 100.0;

      const cap = new Capacitor(capName, cx + 120, cy + 140);
      cap.capacitance = 220.0;

      canvas.components.push(bat, sw, res, cap);

      const w1 = new Wire(canvas.generateKoreanName('wire'), cx - 200, cy - 140, cx - 80, cy - 120);
      const w2 = new Wire(canvas.generateKoreanName('wire'), cx + 40, cy - 120, cx + 60, cy);
      const w3 = new Wire(canvas.generateKoreanName('wire'), cx + 180, cy, cx + 120, cy + 110);
      const w4 = new Wire(canvas.generateKoreanName('wire'), cx + 120, cy + 170, cx - 320, cy - 140);
      const w5 = new Wire(canvas.generateKoreanName('wire'), cx + 40, cy - 100, cx - 80, cy + 60);

      canvas.wires.push(w1, w2, w3, w4, w5);

      w1.ports[0].connectedTo = bat.ports[1]; // +
      w1.ports[1].connectedTo = sw.ports[1];  // SW ON
      w2.ports[0].connectedTo = sw.ports[0];  // SW COM
      w2.ports[1].connectedTo = res.ports[0]; // RES A
      w3.ports[0].connectedTo = res.ports[1]; // RES B
      w3.ports[1].connectedTo = cap.ports[0]; // CAP A
      w4.ports[0].connectedTo = cap.ports[1]; // CAP B
      w4.ports[1].connectedTo = bat.ports[0]; // BAT -
      w5.ports[0].connectedTo = sw.ports[2];  // SW OFF
      w5.ports[1].connectedTo = w4.ports[1];

      graph.setTarget(cap, 'voltage');
      canvas.showToast("🔋 RC 과도 응답 회로가 완성되었습니다.");
    }
    
    else if (name === 'transistor-switch') {
      // 4. 트랜지스터 스위칭 회로
      const batName = canvas.generateKoreanName('battery');
      const swName = canvas.generateKoreanName('switch');
      const resName = canvas.generateKoreanName('resistor');
      const trName = canvas.generateKoreanName('transistor');
      const bulbName = canvas.generateKoreanName('lightbulb');

      const bat = new Battery(batName, cx - 260, cy - 100);
      bat.voltage = 9.0;

      const sw = new Switch(swName, cx - 260, cy + 100);
      sw.isOpen = true;

      const resBase = new Resistor(resName, cx - 80, cy + 30);
      resBase.resistance = 220.0;

      const tr = new Transistor(trName, cx + 100, cy + 30);
      tr.beta = 150.0;

      const bulb = new Lightbulb(bulbName, cx + 100, cy - 100);
      bulb.resistance = 10.0;

      canvas.components.push(bat, sw, resBase, tr, bulb);

      const w1 = new Wire(canvas.generateKoreanName('wire'), cx - 200, cy - 100, cx - 140, cy - 100);
      const w2 = new Wire(canvas.generateKoreanName('wire'), cx - 200, cy - 100, cx - 320, cy + 100);
      const w3 = new Wire(canvas.generateKoreanName('wire'), cx - 200, cy + 80, cx - 140, cy + 30);
      const w4 = new Wire(canvas.generateKoreanName('wire'), cx - 20, cy + 30, cx + 55, cy + 30);
      const w5 = new Wire(canvas.generateKoreanName('wire'), cx - 140, cy - 100, cx + 55, cy - 100);
      const w6 = new Wire(canvas.generateKoreanName('wire'), cx + 145, cy - 100, cx + 145, cy);
      const w7 = new Wire(canvas.generateKoreanName('wire'), cx + 145, cy + 60, cx - 320, cy - 100);

      canvas.wires.push(w1, w2, w3, w4, w5, w6, w7);

      w1.ports[0].connectedTo = bat.ports[1]; // +
      w2.ports[0].connectedTo = bat.ports[1]; 
      w2.ports[1].connectedTo = sw.ports[0];  // SW COM
      w3.ports[0].connectedTo = sw.ports[1];  // SW ON
      w3.ports[1].connectedTo = resBase.ports[0]; // R_base A
      w4.ports[0].connectedTo = resBase.ports[1]; // R_base B
      w4.ports[1].connectedTo = tr.ports[0];      // TR Base
      w5.ports[0].connectedTo = w1.ports[1];
      w5.ports[1].connectedTo = bulb.ports[0];    // Bulb A
      w6.ports[0].connectedTo = bulb.ports[1];    // Bulb B
      w6.ports[1].connectedTo = tr.ports[1];      // TR Collector
      w7.ports[0].connectedTo = tr.ports[2];      // TR Emitter
      w7.ports[1].connectedTo = bat.ports[0];     // Bat -

      canvas.showToast("⚙️ 트랜지스터 스위칭 회로가 로드되었습니다.");
    }

    canvas.triggerUpdate();
    updateGraphSourceDropdown();
    blocks.refreshAllDropdowns();
  };

  const tick = () => {
    engine.solve(canvas.components, canvas.wires, simSpeed);
    canvas.drawAll();

    if (canvas.activeTool === 'voltmeter' && canvas.hoveredPort) {
      graph.setTarget(canvas.hoveredPort, 'voltage');
    } else if (canvas.activeTool === 'ammeter' && canvas.hoveredComponent && canvas.hoveredComponent.type !== 'wire') {
      graph.setTarget(canvas.hoveredComponent, 'current');
    }

    graph.update(engine);
    graph.draw();

    if (Date.now() % 50 === 0) {
      updateGraphSourceDropdown();
      blocks.refreshAllDropdowns();
    }

    requestAnimationFrame(tick);
  };

  tick();

  setTimeout(() => {
    canvas.showToast("⚡ 인터랙티브 회로 실험실에 오신 것을 환영합니다! 접점을 드래그해서 연결해보세요.");
  }, 1000);
});

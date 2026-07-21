// 실시간 전압/전류 그래프 (오실로스코프) 모듈

export class OscilloscopeGraph {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.dataPoints = [];      // { time: number, value: number }
    this.maxDataPoints = 300;  // 화면에 보일 최대 데이터 포인트 수
    this.targetComponent = null;
    this.targetPort = null;
    this.mode = 'voltage';     // 'voltage' (전압) 또는 'current' (전류)
    this.time = 0;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  // 측정 대상 설정
  setTarget(target, mode) {
    this.targetComponent = null;
    this.targetPort = null;
    this.mode = mode;
    this.dataPoints = []; // 새 측정 시작 시 데이터 초기화

    if (target) {
      if (target.constructor.name === 'Port') {
        this.targetPort = target;
      } else {
        this.targetComponent = target;
      }
    }
  }

  // 매 프레임 시뮬레이션 타임 스텝마다 데이터 누적
  update(engine) {
    let val = 0.0;
    this.time += 0.05; // dt 추가

    if (this.targetPort) {
      // 전압 측정 모드: 노드 전압
      val = engine.getNodeVoltage(this.targetPort.nodeIndex);
    } else if (this.targetComponent) {
      if (this.mode === 'current') {
        // 전류 측정 모드
        val = this.targetComponent.current || 0.0;
      } else {
        // 소자 전압 측정 모드 (소자 양단 전압차)
        const p1 = this.targetComponent.ports[0];
        const p2 = this.targetComponent.ports[1];
        if (p1 && p2) {
          const v1 = engine.getNodeVoltage(p1.nodeIndex);
          const v2 = engine.getNodeVoltage(p2.nodeIndex);
          val = v2 - v1;
        }
      }
    } else {
      return; // 대상 없으면 데이터 수집 안 함
    }

    this.dataPoints.push({ time: this.time, value: val });
    if (this.dataPoints.length > this.maxDataPoints) {
      this.dataPoints.shift(); // 슬라이딩 윈도우 스크롤
    }
  }

  clear() {
    this.dataPoints = [];
    this.time = 0;
  }

  // 오실로스코프 렌더링
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. 오실로스코프 그리드 배경 (전통적인 그린-블랙 스타일)
    this.ctx.fillStyle = '#0b0f19';
    this.ctx.fillRect(0, 0, w, h);

    // 모눈선 그리기
    this.ctx.strokeStyle = 'rgba(16, 185, 129, 0.08)';
    this.ctx.lineWidth = 1;
    
    const gridSize = 40;
    // 세로 모눈선
    for (let x = 0; x < w; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }
    // 가로 모눈선
    for (let y = 0; y < h; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }

    // 중앙 기준선 (0V / 0A 선)
    const centerY = h / 2;
    this.ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(w, centerY);
    this.ctx.stroke();

    // 2. 실시간 라인 차트 렌더링
    if (this.dataPoints.length < 2) {
      // 대기 상태 텍스트
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.font = '13px Outfit, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText("측정 도구를 대거나 대상을 선택하면 실시간 전압/전류 그래프가 시작됩니다.", w / 2, centerY);
      return;
    }

    // 스케일 계산
    // 최댓값과 최솟값을 찾아 오토스케일링하거나 적정 한계선 설정
    let maxVal = Math.max(...this.dataPoints.map(p => Math.abs(p.value)));
    // 최솟값/최댓값이 너무 작은 경우 스케일 최소 단위 보정 (예: 5V 혹은 1A)
    const defaultRange = this.mode === 'voltage' ? 5.0 : 0.5; // (±5V / ±500mA)
    maxVal = Math.max(defaultRange, maxVal * 1.2); 

    const scaleY = (h / 2 - 15) / maxVal; // y축 스케일러

    this.ctx.save();
    
    // 그래프 선 색상: 전압(Neon Green), 전류(Neon Orange)
    const color = this.mode === 'voltage' ? '#10b981' : '#fb923c';
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = color;

    this.ctx.beginPath();
    for (let i = 0; i < this.dataPoints.length; i++) {
      const pt = this.dataPoints[i];
      // x좌표는 인덱스 비율로 매핑
      const x = (i / (this.maxDataPoints - 1)) * w;
      // y좌표는 중앙에서 상하 변동
      const y = centerY - pt.value * scaleY;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();
    this.ctx.restore();

    // 3. 우측 하단에 단위/최댓값 스케일 텍스트 표시
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.font = '10px monospace';
    this.ctx.textAlign = 'right';
    
    const unit = this.mode === 'voltage' ? 'V' : 'A';
    this.ctx.fillText(`Y-Range: ±${maxVal.toFixed(2)} ${unit}`, w - 16, 20);
    
    const curVal = this.dataPoints[this.dataPoints.length - 1].value;
    this.ctx.fillStyle = color;
    this.ctx.font = 'bold 12px monospace';
    this.ctx.fillText(`Current Value: ${curVal.toFixed(3)} ${unit}`, w - 16, 38);
  }
}

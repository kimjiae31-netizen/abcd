// 회로 부품 클래스 정의 (1.5배 확대 및 밝은 테마 최적화)

export class Port {
  constructor(id, label, relX, relY, parent) {
    this.id = id;
    this.label = label;
    this.relX = relX;
    this.relY = relY;
    this.parent = parent;
    this.nodeIndex = -1;
    this.connectedTo = null;
  }

  getAbsolutePos() {
    return {
      x: this.parent.x + this.relX,
      y: this.parent.y + this.relY
    };
  }
}

export class Component {
  constructor(id, type, x, y) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.width = 120;
    this.height = 60;
    this.ports = [];
    this.isSelected = false;
    this.label = "";
  }

  updatePorts() {}

  draw(ctx) {}

  containsPoint(px, py) {
    return px >= this.x - this.width / 2 &&
           px <= this.x + this.width / 2 &&
           py >= this.y - this.height / 2 &&
           py <= this.y + this.height / 2;
  }
}

// 1. 전지 (Battery)
export class Battery extends Component {
  constructor(id, x, y) {
    super(id, 'battery', x, y);
    this.width = 120;
    this.height = 60;
    this.voltage = 9.0;
    this.label = "전압원";
    
    this.ports = [
      new Port('p1', '-', -this.width / 2, 0, this),
      new Port('p2', '+', this.width / 2, 0, this)
    ];
  }

  draw(ctx) {
    const isLit = this.isSelected;
    ctx.save();
    ctx.translate(this.x, this.y);

    if (isLit) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#2563eb';
    }

    // 본체 그리기 (밝은 테마 대비가 강한 다크 네이비 본체)
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = isLit ? '#2563eb' : '#475569';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 12);
    ctx.fill();
    ctx.stroke();

    // 전지 전극 기호
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 4.5;
    // 음극 기호 (짧고 굵음)
    ctx.beginPath();
    ctx.moveTo(-15, -18);
    ctx.lineTo(-15, 18);
    ctx.stroke();

    // 양극 기호 (길고 얇음)
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(15, -26);
    ctx.lineTo(15, 26);
    ctx.stroke();

    // 텍스트 표시
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.voltage.toFixed(1)}V`, 0, 0);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px Outfit, sans-serif';
    ctx.fillText(this.id, 0, 42); // 생성된 간결한 이름(예: 전지 1)

    ctx.restore();
    this.drawPorts(ctx);
  }

  drawPorts(ctx) {
    this.ports.forEach(port => {
      const pos = port.getAbsolutePos();
      ctx.fillStyle = port.label === '+' ? '#ef4444' : '#2563eb';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2); // 포트 지름 확대
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

// 2. 저항 (Resistor)
export class Resistor extends Component {
  constructor(id, x, y) {
    super(id, 'resistor', x, y);
    this.width = 120;
    this.height = 45;
    this.resistance = 10.0;
    this.label = "저항";

    this.ports = [
      new Port('p1', 'A', -this.width / 2, 0, this),
      new Port('p2', 'B', this.width / 2, 0, this)
    ];
  }

  draw(ctx) {
    const isLit = this.isSelected;
    ctx.save();
    ctx.translate(this.x, this.y);

    if (isLit) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ea580c';
    }

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = isLit ? '#ea580c' : '#475569';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 + 15, -this.height / 2, this.width - 30, this.height, 8);
    ctx.fill();
    ctx.stroke();

    // 저항 지그재그 패턴
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-35, 0);
    ctx.lineTo(-23, -12);
    ctx.lineTo(-9, 12);
    ctx.lineTo(5, -12);
    ctx.lineTo(19, 12);
    ctx.lineTo(35, 0);
    ctx.stroke();

    // 텍스트 표시
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.resistance.toFixed(1)}Ω`, 0, -28);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px Outfit, sans-serif';
    ctx.fillText(this.id, 0, 32);

    ctx.restore();
    this.drawPorts(ctx);
  }

  drawPorts(ctx) {
    this.ports.forEach(port => {
      const pos = port.getAbsolutePos();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

// 3. 전구 (Lightbulb)
export class Lightbulb extends Component {
  constructor(id, x, y) {
    super(id, 'lightbulb', x, y);
    this.width = 90;
    this.height = 90;
    this.resistance = 10.0;
    this.brightness = 0.0;
    this.burntOut = false;
    this.label = "전구";

    this.ports = [
      new Port('p1', 'A', -this.width / 2, 0, this),
      new Port('p2', 'B', this.width / 2, 0, this)
    ];
  }

  draw(ctx) {
    const isLit = this.isSelected;
    ctx.save();
    ctx.translate(this.x, this.y);

    if (!this.burntOut && this.brightness > 0.02) {
      ctx.shadowBlur = 15 + this.brightness * 35;
      ctx.shadowColor = `rgba(234, 179, 8, ${0.5 + this.brightness * 0.5})`;
    } else if (this.burntOut) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#dc2626';
    } else if (isLit) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#475569';
    }

    // 전구 유리구
    ctx.fillStyle = this.burntOut ? '#4b5563' : 
                     (this.brightness > 0.05 ? `rgba(253, 224, 71, ${0.2 + this.brightness * 0.7})` : '#334155');
    ctx.strokeStyle = this.burntOut ? '#dc2626' : 
                     (this.brightness > 0.05 ? `rgba(234, 179, 8, ${0.7 + this.brightness * 0.3})` : (isLit ? '#0f172a' : '#475569'));
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -8, 28, 0, Math.PI * 2); // 크기 확대
    ctx.fill();
    ctx.stroke();

    // 전구 소켓
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-15, 20, 30, 14);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-12, 34, 24, 6);

    // 필라멘트
    ctx.strokeStyle = this.burntOut ? '#1e293b' : 
                     (this.brightness > 0.05 ? '#eab308' : '#cbd5e1');
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-12, 20);
    ctx.lineTo(-6, -2);
    ctx.lineTo(6, -2);
    ctx.lineTo(12, 20);
    ctx.stroke();

    if (this.burntOut) {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-15, -23);
      ctx.lineTo(15, 7);
      ctx.moveTo(15, -23);
      ctx.lineTo(-15, 7);
      ctx.stroke();
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px Outfit, sans-serif';
    ctx.textAlign = 'center';
    if (this.burntOut) {
      ctx.fillStyle = '#dc2626';
      ctx.fillText("파손됨!", 0, -45);
    } else {
      ctx.fillText(`${this.resistance.toFixed(1)}Ω`, 0, -45);
    }

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillText(this.id, 0, 48);

    ctx.restore();
    this.drawPorts(ctx);
  }

  drawPorts(ctx) {
    this.ports.forEach(port => {
      const pos = port.getAbsolutePos();
      ctx.fillStyle = this.burntOut ? '#dc2626' : '#eab308';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

// 4. 축전기 (Capacitor)
export class Capacitor extends Component {
  constructor(id, x, y) {
    super(id, 'capacitor', x, y);
    this.width = 90;
    this.height = 60;
    this.capacitance = 100.0;
    this.voltage = 0.0;
    this.charge = 0.0;
    this.vPrev = 0.0;
    this.label = "축전기";

    this.ports = [
      new Port('p1', 'A', -this.width / 2, 0, this),
      new Port('p2', 'B', this.width / 2, 0, this)
    ];
  }

  draw(ctx) {
    const isLit = this.isSelected;
    ctx.save();
    ctx.translate(this.x, this.y);

    if (isLit) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#8b5cf6';
    }

    // 도선
    ctx.strokeStyle = isLit ? '#8b5cf6' : '#475569';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-this.width / 2, 0);
    ctx.lineTo(-8, 0);
    ctx.moveTo(8, 0);
    ctx.lineTo(this.width / 2, 0);
    ctx.stroke();

    // 두 극판
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-8, -20);
    ctx.lineTo(-8, 20);
    ctx.moveTo(8, -20);
    ctx.lineTo(8, 20);
    ctx.stroke();

    // 충전 표시
    const maxChargeVoltage = 9.0;
    const chargeRatio = Math.min(1.0, Math.abs(this.voltage) / maxChargeVoltage);
    
    if (chargeRatio > 0.05) {
      ctx.fillStyle = '#7c3aed';
      ctx.font = 'bold 14px Outfit, sans-serif';
      ctx.textAlign = 'center';
      if (this.voltage >= 0) {
        ctx.fillText("+", -20, -10);
        ctx.fillText("-", 20, -10);
      } else {
        ctx.fillText("-", -20, -10);
        ctx.fillText("+", 20, -10);
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(-25, 26, 50, 6);
      ctx.fillStyle = '#8b5cf6';
      ctx.fillRect(-25, 26, 50 * chargeRatio, 6);
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.capacitance.toFixed(0)}µF`, 0, -28);
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 12px Outfit, sans-serif';
    ctx.fillText(`${this.voltage.toFixed(2)}V`, 0, 42);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillText(this.id, 0, 56);

    ctx.restore();
    this.drawPorts(ctx);
  }

  drawPorts(ctx) {
    this.ports.forEach(port => {
      const pos = port.getAbsolutePos();
      ctx.fillStyle = '#8b5cf6';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

// 5. 스위치 (Switch) - SPDT 구조
export class Switch extends Component {
  constructor(id, x, y) {
    super(id, 'switch', x, y);
    this.width = 120;
    this.height = 60;
    this.isOpen = true;
    this.label = "스위치";

    this.ports = [
      new Port('p1', 'COM', -this.width / 2, 0, this),
      new Port('p2', 'ON', this.width / 2, -20, this),
      new Port('p3', 'OFF', this.width / 2, 20, this)
    ];
  }

  draw(ctx) {
    const isLit = this.isSelected;
    ctx.save();
    ctx.translate(this.x, this.y);

    if (isLit) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#0d9488';
    }

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

    // 내부 단자 그리기
    ctx.fillStyle = '#0d9488';
    ctx.beginPath();
    ctx.arc(-30, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(30, -20, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(30, 20, 6, 0, Math.PI * 2);
    ctx.fill();

    // 나이프 그리기
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    if (this.isOpen) {
      ctx.lineTo(26, 17);
    } else {
      ctx.lineTo(26, -17);
    }
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText("ON", 18, -17);
    ctx.fillText("OFF", 18, 23);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.isOpen ? "열림 (OFF)" : "닫힘 (ON)", 0, -32);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillText(this.id, 0, 36);

    ctx.restore();
    this.drawPorts(ctx);
  }

  drawPorts(ctx) {
    this.ports.forEach(port => {
      const pos = port.getAbsolutePos();
      ctx.fillStyle = '#0d9488';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

// 6. 트랜지스터 (NPN Transistor)
export class Transistor extends Component {
  constructor(id, x, y) {
    super(id, 'transistor', x, y);
    this.width = 90;
    this.height = 90;
    this.beta = 100.0;
    this.ib = 0.0;
    this.ic = 0.0;
    this.ie = 0.0;
    this.label = "트랜지스터";

    this.ports = [
      new Port('p1', 'B', -this.width / 2, 0, this),
      new Port('p2', 'C', this.width / 2, -30, this),
      new Port('p3', 'E', this.width / 2, 30, this)
    ];
  }

  draw(ctx) {
    const isLit = this.isSelected;
    ctx.save();
    ctx.translate(this.x, this.y);

    if (isLit) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#e11d48';
    }

    ctx.strokeStyle = isLit ? '#e11d48' : '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, -18);
    ctx.lineTo(-12, 18);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-this.width / 2, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(15, -28);
    ctx.lineTo(this.width / 2, -30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-12, 8);
    ctx.lineTo(15, 28);
    ctx.lineTo(this.width / 2, 30);
    ctx.stroke();

    // 이미터 화살표
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.moveTo(15, 28);
    ctx.lineTo(5, 26);
    ctx.lineTo(9, 17);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`β=${this.beta}`, 0, -38);
    
    ctx.fillStyle = '#e11d48';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillText(`Ic:${(this.ic * 1000).toFixed(1)}mA`, 0, 44);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillText(this.id, 0, 56);

    ctx.restore();
    this.drawPorts(ctx);
  }

  drawPorts(ctx) {
    this.ports.forEach(port => {
      const pos = port.getAbsolutePos();
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

// 7. 전선 (Wire)
export class Wire extends Component {
  constructor(id, startX, startY, endX, endY) {
    const cx = (startX + endX) / 2;
    const cy = (startY + endY) / 2;
    super(id, 'wire', cx, cy);
    
    this.startX = startX;
    this.startY = startY;
    this.endX = endX;
    this.endY = endY;
    this.resistance = 0.05; // 0.05Ω의 도선 미세 저항 부여 -> 전류 시각화 연산 목적
    this.label = "전선";

    this.ports = [
      new Port('p_start', 'S', startX - cx, startY - cy, this),
      new Port('p_end', 'E', endX - cx, endY - cy, this)
    ];
  }

  updatePoints(startX, startY, endX, endY) {
    this.startX = startX;
    this.startY = startY;
    this.endX = endX;
    this.endY = endY;
    this.x = (startX + endX) / 2;
    this.y = (startY + endY) / 2;

    this.ports.forEach(port => {
      if (port.id === 'p_start') {
        port.relX = this.startX - this.x;
        port.relY = this.startY - this.y;
      } else if (port.id === 'p_end') {
        port.relX = this.endX - this.x;
        port.relY = this.endY - this.y;
      }
    });

    this.ports.forEach(port => {
      if (port.id.startsWith('p_mid_')) {
        const absX = port.absX || (this.x + port.relX);
        const absY = port.absY || (this.y + port.relY);
        port.relX = absX - this.x;
        port.relY = absY - this.y;
        port.absX = absX;
        port.absY = absY;
      }
    });
  }

  addMidPort(absX, absY) {
    const id = `p_mid_${Date.now()}_${Math.floor(Math.random() * 100)}`;
    const relX = absX - this.x;
    const relY = absY - this.y;
    const port = new Port(id, 'MID', relX, relY, this);
    port.absX = absX;
    port.absY = absY;
    this.ports.push(port);
    return port;
  }

  containsPoint(px, py) {
    const dx = this.endX - this.startX;
    const dy = this.endY - this.startY;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return false;

    let t = ((px - this.startX) * dx + (py - this.startY) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = this.startX + t * dx;
    const projY = this.startY + t * dy;

    const distSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
    return distSq < 144; // 거리 약 12px 이내 감지
  }

  draw(ctx) {
    const isLit = this.isSelected;
    ctx.save();

    if (isLit) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#3b82f6';
    }

    // 밝은 배경에서 선명한 다크 슬레이트 전선 드로잉
    ctx.strokeStyle = isLit ? '#2563eb' : '#334155';
    ctx.lineWidth = 5; // 두께 확대
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.startX, this.startY);
    ctx.lineTo(this.endX, this.endY);
    ctx.stroke();

    ctx.restore();
    this.drawPorts(ctx);
  }

  drawPorts(ctx) {
    this.ports.forEach(port => {
      const pos = port.getAbsolutePos();
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6.5, 0, Math.PI * 2); // 포트 지름 확대
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
}

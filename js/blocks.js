// 블록 코딩 편집기 및 실행 인터프리터

export class BlockCodingEditor {
  constructor(canvas) {
    this.canvas = canvas; // 회로 캔버스 객체 참조
    this.workspace = document.getElementById('code-workspace');
    this.isRunning = false;
    this.scriptThread = null; // 현재 실행 중인 비동기 스레드 컨텍스트
    this.repeatStack = [];    // 루프 실행 시 반복 횟수 및 인덱스를 관리할 스택

    this.setupDragAndDrop();
    this.setupControls();
  }

  // 드래그 앤 드롭 설정 (블록 조립 및 재배치)
  setupDragAndDrop() {
    const palette = document.querySelector('.palette-blocks');
    
    // 팔레트 내 블록 드래그 시작
    palette.querySelectorAll('.code-block').forEach(block => {
      block.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('action', 'create');
        e.dataTransfer.setData('type', block.dataset.blockType);
      });
    });

    // 워크스페이스 드래그 처리
    this.workspace.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.workspace.classList.add('dragover');
    });

    this.workspace.addEventListener('dragleave', () => {
      this.workspace.classList.remove('dragover');
    });

    this.workspace.addEventListener('drop', (e) => {
      e.preventDefault();
      this.workspace.classList.remove('dragover');

      const action = e.dataTransfer.getData('action');
      const type = e.dataTransfer.getData('type');

      // 플레이스홀더 텍스트 제거
      const placeholder = this.workspace.querySelector('.workspace-placeholder');
      if (placeholder) {
        placeholder.remove();
      }

      if (action === 'create') {
        this.createNewBlockInWorkspace(type);
      }
    });
  }

  // 워크스페이스에 블록 인스턴스 생성
  createNewBlockInWorkspace(type) {
    const blockEl = document.createElement('div');
    blockEl.className = 'code-block workspace-block';
    blockEl.dataset.blockType = type;
    blockEl.draggable = true;

    // 부품 매핑 및 내용 구성
    let content = "";
    if (type === 'wait-time') {
      content = `
        <span>⏱️</span>
        <input type="number" class="val-input" value="2" min="0.1" step="0.5" style="width: 50px;">
        <span>초 대기</span>
      `;
      blockEl.style.borderLeftColor = '#3b82f6';
    } 
    else if (type === 'wait-until-cap') {
      // 축전지 선택 및 완충 조건
      content = `
        <span>🔋</span>
        <select class="cap-select">
          <option value="any">임의 축전기</option>
        </select>
        <span>풀충전까지 대기</span>
      `;
      blockEl.style.borderLeftColor = '#f59e0b';
    } 
    else if (type === 'switch-control') {
      // 스위치 및 동작 선택
      content = `
        <span>🔌</span>
        <select class="switch-select">
          <option value="any">임의 스위치</option>
        </select>
        <span>상태를</span>
        <select class="state-select">
          <option value="close">ON (닫기)</option>
          <option value="open">OFF (열기)</option>
        </select>
        <span>로 설정</span>
      `;
      blockEl.style.borderLeftColor = '#10b981';
    }
    else if (type === 'repeat-loop') {
      content = `
        <span>🔁</span>
        <input type="number" class="val-input" value="3" min="1" step="1" style="width: 45px;">
        <span>번 반복 시작</span>
      `;
      blockEl.style.borderLeftColor = '#ec4899';
    }
    else if (type === 'loop-end') {
      content = `
        <span>🔚 반복 끝</span>
      `;
      blockEl.style.borderLeftColor = '#ec4899';
    }

    blockEl.innerHTML = content;

    // 삭제 버튼 추가 (우측 상단 엑스표)
    const deleteBtn = document.createElement('span');
    deleteBtn.innerHTML = ' &times;';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.marginLeft = '12px';
    deleteBtn.style.color = '#ef4444';
    deleteBtn.style.fontWeight = 'bold';
    deleteBtn.onclick = () => {
      blockEl.remove();
      this.checkPlaceholder();
    };
    blockEl.appendChild(deleteBtn);

    // 드래그앤드롭 순서 정렬을 위한 이벤트 바인딩
    blockEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('action', 'reorder');
      this.draggedBlock = blockEl;
    });

    blockEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.draggedBlock && this.draggedBlock !== blockEl) {
        const rect = blockEl.getBoundingClientRect();
        const next = (e.clientY - rect.top) > (rect.height / 2);
        this.workspace.insertBefore(this.draggedBlock, next ? blockEl.nextSibling : blockEl);
      }
    });

    // 동적으로 드롭다운 데이터 갱신
    this.updateDropdowns(blockEl);

    this.workspace.appendChild(blockEl);
  }

  // 캔버스 내 배치된 소자들과 매치하여 드롭다운 리스트 채워넣음
  updateDropdowns(blockEl) {
    if (blockEl.dataset.blockType === 'switch-control') {
      const select = blockEl.querySelector('.switch-select');
      const switches = this.canvas.components.filter(c => c.type === 'switch');
      
      select.innerHTML = '<option value="any">임의 스위치</option>';
      switches.forEach(sw => {
        select.innerHTML += `<option value="${sw.id}">${sw.id}</option>`;
      });
    }
    else if (blockEl.dataset.blockType === 'wait-until-cap') {
      const select = blockEl.querySelector('.cap-select');
      const caps = this.canvas.components.filter(c => c.type === 'capacitor');
      
      select.innerHTML = '<option value="any">임의 축전기</option>';
      caps.forEach(cap => {
        select.innerHTML += `<option value="${cap.id}">${cap.id}</option>`;
      });
    }
  }

  // 필요할 때 모든 워크스페이스 블록의 드롭다운을 갱신
  refreshAllDropdowns() {
    this.workspace.querySelectorAll('.workspace-block').forEach(block => {
      this.updateDropdowns(block);
    });
  }

  checkPlaceholder() {
    if (this.workspace.querySelectorAll('.workspace-block').length === 0) {
      this.workspace.innerHTML = '<div class="workspace-placeholder">여기에 블록을 끌어다 놓으세요</div>';
    }
  }

  // 실행 및 정지 제어 바인딩
  setupControls() {
    const runBtn = document.getElementById('btn-run-code');
    const stopBtn = document.getElementById('btn-stop-code');

    runBtn.onclick = () => this.runScript();
    stopBtn.onclick = () => this.stopScript();
  }

  // 블록 코딩 실행 인터프리터
  async runScript() {
    const blocks = Array.from(this.workspace.querySelectorAll('.workspace-block'));
    if (blocks.length === 0) return;

    this.isRunning = true;
    document.getElementById('btn-run-code').disabled = true;
    document.getElementById('btn-stop-code').disabled = false;

    // AST (명령 리스트) 작성
    const commands = this.parseBlocks(blocks);

    try {
      await this.executeCommands(commands);
      this.canvas.showToast("⚡ 코드 실행이 성공적으로 완료되었습니다!");
    } catch (err) {
      if (err.message === 'STOPPED') {
        this.canvas.showToast("🛑 코드 실행이 중단되었습니다.");
      } else {
        console.error(err);
        this.canvas.showToast("⚠️ 실행 중 오류가 발생했습니다.");
      }
    } finally {
      this.stopScript();
    }
  }

  // 코딩 스크립트 중지
  stopScript() {
    this.isRunning = false;
    this.repeatStack = [];
    
    // 블록들의 하이라이트 클래스 제거
    this.workspace.querySelectorAll('.workspace-block').forEach(b => {
      b.classList.remove('running-highlight');
      b.style.boxShadow = '';
    });

    document.getElementById('btn-run-code').disabled = false;
    document.getElementById('btn-stop-code').disabled = true;
  }

  // 블록 DOM 요소들을 순차 명령으로 파싱
  parseBlocks(blocks) {
    const commands = [];
    
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const type = block.dataset.blockType;

      const cmd = {
        type: type,
        element: block,
        index: i
      };

      if (type === 'wait-time') {
        cmd.value = parseFloat(block.querySelector('.val-input').value);
      } 
      else if (type === 'wait-until-cap') {
        cmd.capId = block.querySelector('.cap-select').value;
      } 
      else if (type === 'switch-control') {
        cmd.switchId = block.querySelector('.switch-select').value;
        cmd.state = block.querySelector('.state-select').value;
      }
      else if (type === 'repeat-loop') {
        cmd.count = parseInt(block.querySelector('.val-input').value);
        // 루프 매칭(Loop End 찾기)
        let loopCount = 1;
        let endIdx = -1;
        for (let j = i + 1; j < blocks.length; j++) {
          if (blocks[j].dataset.blockType === 'repeat-loop') loopCount++;
          if (blocks[j].dataset.blockType === 'loop-end') loopCount--;
          if (loopCount === 0) {
            endIdx = j;
            break;
          }
        }
        cmd.endIndex = endIdx; // 루프가 끝나는 위치 지정
      }

      commands.push(cmd);
    }
    return commands;
  }

  // 명령 리스트 비동기 순차 실행
  async executeCommands(commands) {
    let ip = 0; // Instruction Pointer (명령 포인터)
    const callStack = []; // 루프 재도입 정보를 담을 스택

    while (ip < commands.length) {
      if (!this.isRunning) {
        throw new Error('STOPPED');
      }

      const cmd = commands[ip];
      
      // 현재 실행 중인 블록 강조 표시
      this.workspace.querySelectorAll('.workspace-block').forEach(b => {
        b.classList.remove('running-highlight');
        b.style.boxShadow = '';
      });
      cmd.element.classList.add('running-highlight');
      cmd.element.style.boxShadow = '0 0 12px var(--accent-color)';

      // 각 명령 처리
      if (cmd.type === 'wait-time') {
        // n초 대기 (시뮬레이션 시간 흐름 반영을 위해 청크로 쪼개어 루프 돌며 물리 상태 갱신)
        const waitMs = cmd.value * 1000;
        const stepMs = 50;
        let elapsed = 0;
        
        while (elapsed < waitMs) {
          if (!this.isRunning) throw new Error('STOPPED');
          await new Promise(resolve => setTimeout(resolve, stepMs));
          elapsed += stepMs;
        }
        ip++;
      } 
      else if (cmd.type === 'wait-until-cap') {
        // 축전기가 만충(90% 이상 충전)될 때까지 루프 감시
        let isCharged = false;
        while (!isCharged) {
          if (!this.isRunning) throw new Error('STOPPED');
          
          let cap = null;
          if (cmd.capId === 'any') {
            cap = this.canvas.components.find(c => c.type === 'capacitor');
          } else {
            cap = this.canvas.components.find(c => c.id === cmd.capId);
          }

          if (cap) {
            // 커패시터 최대 충전 전압 판정 (전압원 최대 9V라고 할 때, 또는 충전 전하 변화율이 미미할 때)
            // 간단히 전압 8.5V 이상 충전되거나 양단 전압 변화율이 거의 없을 때를 완충으로 판정
            // 배터리가 없으면 바로 완충된 것으로 탈출
            const batteries = this.canvas.components.filter(c => c.type === 'battery');
            const maxV = batteries.length > 0 ? Math.max(...batteries.map(b => b.voltage)) : 9.0;
            
            if (Math.abs(cap.voltage) >= maxV * 0.95) {
              isCharged = true;
            }
          } else {
            // 축전기가 없으면 무한 대기를 피하기 위해 바로 통과
            isCharged = true;
          }
          
          if (!isCharged) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms마다 체크
          }
        }
        ip++;
      } 
      else if (cmd.type === 'switch-control') {
        // 스위치 제어
        let targetSwitches = [];
        if (cmd.switchId === 'any') {
          targetSwitches = this.canvas.components.filter(c => c.type === 'switch');
        } else {
          const sw = this.canvas.components.find(c => c.id === cmd.switchId);
          if (sw) targetSwitches.push(sw);
        }

        targetSwitches.forEach(sw => {
          sw.isOpen = (cmd.state === 'open');
        });

        this.canvas.triggerUpdate(); // 물리 상태 다시 연산
        await new Promise(resolve => setTimeout(resolve, 200)); // 연출 시간
        ip++;
      }
      else if (cmd.type === 'repeat-loop') {
        // 루프 제어
        if (cmd.endIndex === -1) {
          // 짝이 안 맞는 루프 -> 통과
          ip++;
          continue;
        }

        // 루프 상태 초기화 혹은 카운트 진행
        let stackFrame = callStack.find(frame => frame.ip === ip);
        if (!stackFrame) {
          stackFrame = {
            ip: ip,
            total: cmd.count,
            current: 0
          };
          callStack.push(stackFrame);
        }

        if (stackFrame.current < stackFrame.total) {
          stackFrame.current++;
          ip++; // 루프 본문으로 진입
        } else {
          // 루프가 다 끝났으므로 루프 스택 프레임 삭제 및 루프 너머로 점프
          const idx = callStack.indexOf(stackFrame);
          if (idx > -1) callStack.splice(idx, 1);
          ip = cmd.endIndex + 1;
        }
      }
      else if (cmd.type === 'loop-end') {
        // Loop End에 도달하면 대응되는 repeat-loop 시작점으로 점프
        // 콜스택에서 가장 최근의 루프 프레임을 찾음
        if (callStack.length > 0) {
          const lastFrame = callStack[callStack.length - 1];
          ip = lastFrame.ip; // 루프 조건 검사 위치로 돌아감
        } else {
          ip++;
        }
      }
    }
  }
}

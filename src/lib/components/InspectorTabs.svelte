<script lang="ts">
  import type { VMState } from '../../core/index.js';
  import { MAX_INSPECTOR_ITEMS, formatBigIntDisplay, formatCharPreview } from '../utils.js';

  interface Props {
    vmState: VMState | null;
  }

  let { vmState }: Props = $props();

  let activeTab: 'inspector' | 'cheatsheet' = $state('inspector');

  let stackItems = $derived.by(() => {
    const stack = vmState?.stack ?? [];
    const total = stack.length;
    const minIndex = Math.max(0, total - MAX_INSPECTOR_ITEMS);
    const rows: Array<{
      index: number;
      isTop: boolean;
      text: string;
      full: string;
      charPreview: string | null;
    }> = [];
    for (let i = total - 1; i >= minIndex; i -= 1) {
      const val = stack[i];
      const display = formatBigIntDisplay(val);
      rows.push({
        index: i,
        isTop: i === total - 1,
        text: display.text,
        full: display.full,
        charPreview: formatCharPreview(val),
      });
    }
    return { rows, total, omitted: minIndex };
  });

  let memoryItems = $derived.by(() => {
    const memory = vmState?.memory ?? [];
    const total = memory.length;
    const sliced = memory.slice(0, MAX_INSPECTOR_ITEMS);
    const sorted = [...sliced].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const rows = sorted.map(([addr, val]) => {
      const addrDisplay = formatBigIntDisplay(addr);
      const valDisplay = formatBigIntDisplay(val);
      return {
        key: addrDisplay.full,
        addrText: addrDisplay.text,
        addrFull: addrDisplay.full,
        valText: valDisplay.text,
        valFull: valDisplay.full,
        charPreview: formatCharPreview(val),
      };
    });
    return {
      rows,
      total,
      omitted: Math.max(0, total - MAX_INSPECTOR_ITEMS),
    };
  });
</script>

<div class="tabs-shell">
  <div class="tab-bar" role="tablist">
    <button
      id="tab-btn-inspector"
      type="button"
      class="tab-btn"
      class:active={activeTab === 'inspector'}
      role="tab"
      aria-selected={activeTab === 'inspector'}
      aria-controls="tab-inspector"
      onclick={() => (activeTab = 'inspector')}
    >
      STACK &amp; MEMORY
    </button>
    <button
      id="tab-btn-cheatsheet"
      type="button"
      class="tab-btn"
      class:active={activeTab === 'cheatsheet'}
      role="tab"
      aria-selected={activeTab === 'cheatsheet'}
      aria-controls="tab-cheatsheet"
      onclick={() => (activeTab = 'cheatsheet')}
    >
      SPEC / CHEATSHEET
    </button>
  </div>

  <div
    id="tab-inspector"
    class="tab-panel"
    role="tabpanel"
    aria-labelledby="tab-btn-inspector"
    hidden={activeTab !== 'inspector'}
  >
    <div class="inspector-grid">
      <div class="inspector-pane">
        <div class="pane-head">
          <h4>STACK</h4>
          <span class="count-pill">{stackItems.total}</span>
        </div>
        <div class="pane-body">
          {#if stackItems.total === 0}
            <div class="empty-msg">스택이 비어 있습니다.</div>
          {:else}
            {#each stackItems.rows as row (row.index)}
              <div class="item-row" class:is-top={row.isTop}>
                <span class="item-key">{row.isTop ? `[${row.index}] TOP` : `[${row.index}]`}</span>
                <span class="item-val">
                  <span title={row.text !== row.full ? row.full : undefined}>{row.text}</span>
                  {#if row.charPreview}
                    <span class="char-badge">{row.charPreview}</span>
                  {/if}
                </span>
              </div>
            {/each}
            {#if stackItems.omitted > 0}
              <div class="truncated-note">
                … 하위 {stackItems.omitted}개 항목 생략 (상위 {MAX_INSPECTOR_ITEMS}개만 표시)
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <div class="inspector-pane">
        <div class="pane-head">
          <h4>MEMORY (HEAP)</h4>
          <span class="count-pill">{memoryItems.total}</span>
        </div>
        <div class="pane-body">
          {#if memoryItems.total === 0}
            <div class="empty-msg">할당된 메모리가 없습니다.</div>
          {:else}
            {#each memoryItems.rows as row (row.key)}
              <div class="item-row">
                <span
                  class="item-key"
                  title={row.addrText !== row.addrFull ? `mem[${row.addrFull}]` : undefined}
                >
                  mem[{row.addrText}]
                </span>
                <span class="item-val">
                  <span title={row.valText !== row.valFull ? row.valFull : undefined}>
                    {row.valText}
                  </span>
                  {#if row.charPreview}
                    <span class="char-badge">{row.charPreview}</span>
                  {/if}
                </span>
              </div>
            {/each}
            {#if memoryItems.omitted > 0}
              <div class="truncated-note">… 외 {memoryItems.omitted}개 메모리 칸 생략</div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div
    id="tab-cheatsheet"
    class="tab-panel"
    role="tabpanel"
    aria-labelledby="tab-btn-cheatsheet"
    hidden={activeTab !== 'cheatsheet'}
  >
    <div class="cheatsheet-scroll">
      <table class="cheatsheet-table">
        <thead>
          <tr>
            <th>키워드</th>
            <th>변형 / 억양</th>
            <th>동작 설명</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>요이~</code> / <code>줴줴이야</code></td>
            <td>프로그램 시작 / 종료</td>
            <td>첫 토큰은 반드시 <code>요이~</code>(1회), 마지막은 <code>줴줴이야</code> (중간 조기 종료도 가능)</td>
          </tr>
          <tr>
            <td><code>엄</code></td>
            <td><code>엄</code> / <code>엄...</code> / <code>엄,,</code> / <code>어엄.</code></td>
            <td>정수 push: <code>.</code>은 +1, <code>,</code>은 -1(혼합 금지), 앞의 <code>어</code> 개수만큼 ×10<sup>k</sup> (<code>어엄</code>만 쓰기 금지)</td>
          </tr>
          <tr>
            <td><code>예?</code></td>
            <td><code>예?</code> / <code>아 예?</code></td>
            <td><code>예?</code> 정수 입력 push · <code>아 예?</code> 문자 1글자 코드포인트 입력 (EOF=-1)</td>
          </tr>
          <tr>
            <td><code>티~원</code></td>
            <td><code>티~원</code> / <code>티~~원</code> / <code>티~원!</code></td>
            <td>정수 출력 / 정수+줄바꿈 출력 / 유니코드 문자 출력</td>
          </tr>
          <tr>
            <td><code>지~랄</code> <small>(별칭: <code>지~롤</code>)</small></td>
            <td><code>~</code> 0~4개 / 끝에 <code>?</code>(0~2개)</td>
            <td>스택 순서 <code>a b → a op b</code>: 산술(<code>+ - * / %</code>: <code>~</code> 0~4개) · 비교(<code>== &lt; &gt;</code>: <code>~</code> 0~2개 + <code>?</code>)</td>
          </tr>
          <tr>
            <td><code>쥐~랄</code></td>
            <td><code>~</code> 0~4개 / <code>쥐랄!</code> <code>쥐~랄!</code></td>
            <td>스택(<code>DUP SWAP OVER ROT DEPTH</code>) · 메모리(<code>STORE</code>: <code>val addr →</code> / <code>LOAD</code>: <code>addr → val</code>)</td>
          </tr>
          <tr>
            <td><code>아뇨아뇨</code></td>
            <td><code>아뇨</code> · <code>아뇨아뇨?</code> · <code>아뇨아뇨</code> · <code>아뇨아뇨~</code> · <code>아뇨아뇨!</code> · <code>아뇨아뇨아뇨</code></td>
            <td><code>NOT</code> · <code>IF</code> · <code>ELSE</code> · <code>WHILE</code>(top peek, pop 안 함) · <code>END</code> · <code>CONTINUE</code></td>
          </tr>
          <tr>
            <td><code>넌 나가라</code></td>
            <td><code>넌 나가라</code> / <code>넌 나가라!</code></td>
            <td>스택 top 버리기(<code>POP</code>) / 가장 가까운 반복문 탈출(<code>BREAK</code>)</td>
          </tr>
          <tr>
            <td><code>//</code></td>
            <td>한 줄 주석</td>
            <td><code>//</code>부터 줄 끝까지 무시 (미등록 단어는 문법 에러!)</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .tabs-shell {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .tab-bar {
    display: flex;
    gap: 16px;
    padding: 0 14px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
  }

  .tab-btn {
    padding: 10px 2px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: color 0.12s ease, border-color 0.12s ease;
  }

  .tab-btn:hover {
    color: var(--text-secondary);
  }

  .tab-btn.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
  }

  .tab-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .tab-panel[hidden] {
    display: none;
  }

  .inspector-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    flex: 1;
    min-height: 240px;
  }

  .inspector-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 240px;
    max-height: 340px;
    background: var(--bg-editor);
  }

  .inspector-pane + .inspector-pane {
    border-left: 1px solid var(--border);
  }

  .pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg-base);
    border-bottom: 1px solid var(--border);
  }

  .pane-head h4 {
    margin: 0;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    color: var(--text-muted);
  }

  .pane-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .empty-msg,
  .truncated-note {
    font-size: 11.5px;
    color: var(--text-muted);
    padding: 4px 2px;
  }

  .truncated-note {
    text-align: center;
    border-top: 1px dashed var(--border);
    padding-top: 6px;
  }

  .item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 8px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-base);
    font-size: 12px;
  }

  .item-row.is-top {
    border-color: var(--border-strong);
    background: var(--bg-surface);
  }

  .item-key {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .item-val {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--text-primary);
    max-width: 72%;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .char-badge {
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 2px;
    border: 1px solid var(--border);
    background: var(--bg-editor);
    color: var(--warn);
    font-weight: 500;
    flex-shrink: 0;
  }

  .cheatsheet-scroll {
    background: var(--bg-editor);
    overflow: auto;
    max-height: 340px;
    flex: 1;
  }

  .cheatsheet-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .cheatsheet-table th,
  .cheatsheet-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
    line-height: 1.45;
  }

  .cheatsheet-table th {
    background: var(--bg-base);
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0.05em;
    position: sticky;
    top: 0;
  }

  .cheatsheet-table code {
    padding: 1px 5px;
    border-radius: 2px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  @media (max-width: 720px) {
    .inspector-grid {
      grid-template-columns: 1fr;
    }

    .inspector-pane + .inspector-pane {
      border-left: 0;
      border-top: 1px solid var(--border);
    }
  }
</style>

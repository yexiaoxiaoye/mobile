/**
 * Diary App - 日记应用
 * 为mobile-phone.js提供日记功能，显示摘要列表
 */

// @ts-nocheck
// 避免重复定义
if (typeof window.DiaryApp === 'undefined') {
  class DiaryApp {
    constructor() {
      this.diaryList = []; // 日记列表
      this.eventListenersSetup = false;

      this.init();
    }

    init() {
      console.log('[Diary App] 日记应用初始化开始 - 版本 1.0');

      // 立即从变量管理器读取一次日记信息
      this.parseDiariesFromContext();

      // 异步初始化监控，避免阻塞界面渲染
      setTimeout(() => {
        this.setupContextMonitor();
      }, 100);

      console.log('[Diary App] 日记应用初始化完成');
    }

    // 设置上下文监控
    setupContextMonitor() {
      console.log('[Diary App] 设置上下文监控...');
      this.setupSillyTavernEventListeners();
    }

    // 手动刷新日记数据
    refreshDiariesData() {
      console.log('[Diary App] 🔄 手动刷新日记数据...');
      this.parseDiariesFromContext();
    }

    // 设置SillyTavern事件监听器
    setupSillyTavernEventListeners() {
      // 防止重复设置
      if (this.eventListenersSetup) {
        return;
      }

      try {
        // 监听SillyTavern的事件系统
        const eventSource = window['eventSource'];
        const event_types = window['event_types'];

        if (eventSource && event_types) {
          this.eventListenersSetup = true;

          const handleMessageReceived = () => {
            console.log('[Diary App] 📨 收到 MESSAGE_RECEIVED 事件，刷新日记数据...');
            setTimeout(() => {
              // 先解析数据
              this.parseDiariesFromContext();

              // 如果应用当前处于活动状态，强制刷新UI
              const appContent = document.getElementById('app-content');
              if (appContent && appContent.querySelector('.cd-diary-app')) {
                console.log('[Diary App] 🔄 强制刷新日记应用UI...');
                appContent.innerHTML = this.getAppContent();
                this.bindEvents();
              }
            }, 500);
          };

          if (event_types.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
            console.log('[Diary App] ✅ 已注册 MESSAGE_RECEIVED 事件监听');
          }

          // 监听聊天变化事件
          if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
              console.log('[Diary App] 📨 聊天已切换，刷新日记数据...');
              setTimeout(() => {
                this.parseDiariesFromContext();
              }, 500);
            });
            console.log('[Diary App] ✅ 已注册 CHAT_CHANGED 事件监听');
          }

          // 保存引用以便后续清理
          this.messageReceivedHandler = handleMessageReceived;
        } else {
          setTimeout(() => {
            this.setupSillyTavernEventListeners();
          }, 5000);
        }
      } catch (error) {
        console.warn('[Diary App] 设置SillyTavern事件监听器失败:', error);
      }
    }

    // 从上下文解析日记信息
    parseDiariesFromContext() {
      try {
        // 获取当前日记数据
        const diaryData = this.getCurrentDiaryData();

        // 更新日记列表
        if (diaryData.diaries.length !== this.diaryList.length || this.hasDiariesChanged(diaryData.diaries)) {
          this.diaryList = diaryData.diaries;
          console.log('[Diary App] 📔 日记数据已更新，日记数:', this.diaryList.length);

          // 只有在当前显示日记应用时才更新UI
          if (this.isCurrentlyActive()) {
            console.log('[Diary App] 🎨 日记应用处于活动状态，更新UI...');
            this.updateAppContent();
          } else {
            console.log('[Diary App] 💤 日记应用未激活，数据已更新但UI延迟渲染');
          }
        } else {
          console.log('[Diary App] 📊 日记数据无变化，跳过更新');
        }
      } catch (error) {
        console.error('[Diary App] 解析日记信息失败:', error);
      }
    }

    // 检查日记应用是否当前活动
    isCurrentlyActive() {
      const appContent = document.getElementById('app-content');
      if (!appContent) return false;

      // 检查是否包含日记应用的特征元素
      return appContent.querySelector('.cd-diary-app') !== null;
    }

    /**
     * 从变量管理器获取摘要数据
     */
    getCurrentDiaryData() {
      try {
        // 使用 Mvu 框架获取变量
        if (window.Mvu && typeof window.Mvu.getMvuData === 'function') {
          // 获取目标消息ID（向上查找最近有AI消息的楼层）
          let targetMessageId = 'latest';

          if (typeof window.getLastMessageId === 'function' && typeof window.getChatMessages === 'function') {
            let currentId = window.getLastMessageId();

            // 向上查找AI消息（跳过用户消息）
            while (currentId >= 0) {
              const message = window.getChatMessages(currentId).at(-1);
              if (message && message.role !== 'user') {
                targetMessageId = currentId;
                if (currentId !== window.getLastMessageId()) {
                  console.log(`[Diary App] 📝 向上查找到第 ${currentId} 层的AI消息`);
                }
                break;
              }
              currentId--;
            }

            if (currentId < 0) {
              targetMessageId = 'latest';
              console.warn('[Diary App] ⚠️ 没有找到AI消息，使用最后一层');
            }
          }

          console.log('[Diary App] 使用消息ID:', targetMessageId);

          // 获取变量
          const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
          console.log('[Diary App] 从 Mvu 获取变量数据:', mvuData);
          console.log('[Diary App] stat_data 存在:', !!mvuData?.stat_data);
          if (mvuData?.stat_data) {
            console.log('[Diary App] stat_data 的键:', Object.keys(mvuData.stat_data));
            console.log('[Diary App] 摘要是否存在:', !!mvuData.stat_data['摘要']);
            if (mvuData.stat_data['摘要']) {
              console.log('[Diary App] 摘要原始数据:', mvuData.stat_data['摘要']);
            }
          }

          // 尝试从 stat_data 读取
          if (mvuData && mvuData.stat_data && mvuData.stat_data['摘要']) {
            const summaryData = mvuData.stat_data['摘要'];
            console.log('[Diary App] ✅ 从 stat_data 获取到摘要数据:', summaryData);
            return this.parseDiaryData(summaryData);
          }

          // 尝试从根级别读取
          if (mvuData && mvuData['摘要']) {
            const summaryData = mvuData['摘要'];
            console.log('[Diary App] ✅ 从根级别获取到摘要数据:', summaryData);
            return this.parseDiaryData(summaryData);
          }
        }

        console.log('[Diary App] 未找到摘要数据');
      } catch (error) {
        console.warn('[Diary App] 获取摘要数据失败:', error);
      }

      return { diaries: [] };
    }

    /**
     * 解析日记变量数据
     * 摘要结构可能是以下两种之一：
     * 1. [['$__META_EXTENSIBLE__$', {日期: 'YYYY-MM-DD', 内容: '...'}, ...], '描述'] (标准Mvu格式)
     * 2. [{日期: 'YYYY-MM-DD', 内容: '...'}, ...] (简化格式)
     */
    parseDiaryData(summaryData) {
      const diaries = [];

      try {
        console.log('[Diary App] 开始解析摘要数据:', summaryData);
        console.log('[Diary App] 摘要数据类型:', typeof summaryData);
        console.log('[Diary App] 是否为数组:', Array.isArray(summaryData));

        if (!summaryData || !Array.isArray(summaryData)) {
          console.warn('[Diary App] 摘要数据格式不正确，不是数组');
          return { diaries };
        }

        // 尝试检测摘要格式
        let summaryArray = summaryData;

        // 如果第一个元素是数组，说明是Mvu标准格式 [[...], '描述']
        if (summaryData.length > 0 && Array.isArray(summaryData[0])) {
          console.log('[Diary App] 检测到Mvu标准格式 [[...], "描述"]');
          summaryArray = summaryData[0];
        } else {
          console.log('[Diary App] 检测到简化格式 [{...}, ...]');
        }

        if (!Array.isArray(summaryArray)) {
          console.warn('[Diary App] 摘要数组格式不正确');
          return { diaries };
        }

        console.log('[Diary App] 摘要数组长度:', summaryArray.length);
        console.log('[Diary App] 摘要数组内容:', summaryArray);

        // 遍历所有摘要（跳过 '$__META_EXTENSIBLE__$' 标记）
        for (let i = 0; i < summaryArray.length; i++) {
          const item = summaryArray[i];

          // 跳过扩展标记
          if (item === '$__META_EXTENSIBLE__$') {
            console.log(`[Diary App] 跳过扩展标记，索引 ${i}`);
            continue;
          }

          if (item && typeof item === 'object') {
            const date = item['日期'] || item.date || '未知日期';
            const content = item['内容'] || item.content || '暂无内容';

            console.log(`[Diary App] 解析日记 ${i}:`, { date, content: content.substring(0, 50) + '...' });

            diaries.push({
              id: `diary_${i}_${Date.now()}`,
              date: date,
              content: content,
              expanded: false // 默认收起
            });
          } else {
            console.log(`[Diary App] 跳过非对象元素，索引 ${i}:`, item);
          }
        }

        // 按日期倒序排列（最新的在前面）
        diaries.sort((a, b) => {
          if (a.date === '未知日期') return 1;
          if (b.date === '未知日期') return -1;
          return b.date.localeCompare(a.date);
        });

        console.log('[Diary App] 从摘要解析完成，日记数:', diaries.length);
        if (diaries.length > 0) {
          console.log('[Diary App] 第一条日记:', diaries[0]);
        }
      } catch (error) {
        console.error('[Diary App] 解析日记数据失败:', error);
      }

      return { diaries };
    }

    // 检查日记是否有变化
    hasDiariesChanged(newDiaries) {
      if (newDiaries.length !== this.diaryList.length) {
        return true;
      }

      for (let i = 0; i < newDiaries.length; i++) {
        const newDiary = newDiaries[i];
        const oldDiary = this.diaryList[i];

        if (
          !oldDiary ||
          newDiary.date !== oldDiary.date ||
          newDiary.content !== oldDiary.content
        ) {
          return true;
        }
      }

      return false;
    }

    // 获取应用内容
    getAppContent() {
      console.log('[Diary App] 获取日记应用内容');

      // 每次打开应用时重新解析一次数据（确保显示最新内容）
      const diaryData = this.getCurrentDiaryData();
      if (diaryData.diaries.length !== this.diaryList.length || this.hasDiariesChanged(diaryData.diaries)) {
        this.diaryList = diaryData.diaries;
        console.log('[Diary App] 📔 打开应用时更新日记数据，日记数:', this.diaryList.length);
      }

      return this.renderDiaryList();
    }

    // 渲染日记列表
    renderDiaryList() {
      console.log('[Diary App] 渲染日记列表...');

      if (!this.diaryList.length) {
        return `
          <div class="cd-diary-app">
            <div class="cd-diary-header">
              <div class="cd-diary-title">📔 我的日记</div>
            </div>
            <div class="cd-diary-empty">
              <div class="cd-empty-icon">📖</div>
              <div class="cd-empty-title">暂无日记</div>
              <div class="cd-empty-subtitle">开始你的冒险，记录精彩瞬间</div>
            </div>
          </div>
        `;
      }

      const diaryItems = this.diaryList
        .map(
          diary => `
          <div class="cd-diary-item ${diary.expanded ? 'cd-expanded' : 'cd-collapsed'}" data-diary-id="${diary.id}">
            <div class="cd-diary-item-header" data-diary-id="${diary.id}">
              <div class="cd-diary-date">📅 ${diary.date}</div>
              <div class="cd-diary-toggle">${diary.expanded ? '▼' : '▶'}</div>
            </div>
            <div class="cd-diary-item-content ${diary.expanded ? 'cd-show' : 'cd-hide'}">
              <div class="cd-diary-content-text">${diary.content}</div>
            </div>
          </div>
        `
        )
        .join('');

      return `
        <div class="cd-diary-app">
          <div class="cd-diary-header">
            <div class="cd-diary-title">📔 我的日记</div>
            <div class="cd-diary-count">${this.diaryList.length} 篇</div>
          </div>
          <div class="cd-diary-list">
            ${diaryItems}
          </div>
        </div>
      `;
    }

    // 绑定事件
    bindEvents() {
      console.log('[Diary App] 绑定事件...');

      // 绑定日记条目点击事件（展开/收起）
      document.querySelectorAll('.cd-diary-item-header').forEach(header => {
        header.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const diaryId = e.currentTarget.getAttribute('data-diary-id');
          this.toggleDiary(diaryId);
        });
      });
    }

    // 切换日记展开/收起状态
    toggleDiary(diaryId) {
      const diary = this.diaryList.find(d => d.id === diaryId);
      if (!diary) return;

      diary.expanded = !diary.expanded;
      console.log(`[Diary App] 切换日记状态: ${diaryId}, expanded: ${diary.expanded}`);

      // 更新UI
      this.updateAppContent();
    }

    // 更新应用内容
    updateAppContent() {
      const appContent = document.getElementById('app-content');
      if (appContent) {
        appContent.innerHTML = this.getAppContent();
        this.bindEvents();
      }
    }
  }

  // 创建全局实例
  window.DiaryApp = DiaryApp;
  window.diaryApp = new DiaryApp();
} // 结束类定义检查

// 全局函数供mobile-phone.js调用
window.getDiaryAppContent = function () {
  console.log('[Diary App] 获取日记应用内容');

  if (!window.diaryApp) {
    console.error('[Diary App] diaryApp实例不存在');
    return '<div class="error-message">日记应用加载失败</div>';
  }

  try {
    return window.diaryApp.getAppContent();
  } catch (error) {
    console.error('[Diary App] 获取应用内容失败:', error);
    return '<div class="error-message">获取内容失败</div>';
  }
};

window.bindDiaryAppEvents = function () {
  console.log('[Diary App] 绑定日记应用事件');

  if (!window.diaryApp) {
    console.error('[Diary App] diaryApp实例不存在');
    return;
  }

  try {
    window.diaryApp.bindEvents();
  } catch (error) {
    console.error('[Diary App] 绑定事件失败:', error);
  }
};

// 调试功能
window.diaryAppDebugInfo = function () {
  if (window.diaryApp) {
    console.log('[Diary App Debug] 当前日记数量:', window.diaryApp.diaryList.length);
    console.log('[Diary App Debug] 日记列表:', window.diaryApp.diaryList);
  }
};

// 初始化
console.log('[Diary App] 日记应用模块加载完成 - 版本 1.0');


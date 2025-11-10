/**
 * Task App - 任务应用
 * 基于shop-app.js的模式，为mobile-phone.js提供任务功能
 */

// @ts-nocheck
// 避免重复定义
if (typeof window.TaskApp === 'undefined') {
  class TaskApp {
    constructor() {
      this.currentView = 'taskList'; // 'taskList', 'inProgress', 'completed'
      this.tasks = [];
      this.acceptedTasks = [];
      this.completedTasks = [];
      this.contextMonitor = null;
      this.lastTaskCount = 0;
      this.isAutoRenderEnabled = true;
      this.lastRenderTime = 0;
      this.renderCooldown = 1000;
      this.eventListenersSetup = false;
      this.contextCheckInterval = null;

      this.init();
    }

    init() {
      console.log('[Task App] 任务应用初始化开始 - 版本 3.0 (事件驱动 + 族会目标)');

      // 立即从变量管理器读取一次族会目标
      this.parseTasksFromContext();

      // 异步初始化监控，避免阻塞界面渲染
      setTimeout(() => {
        this.setupContextMonitor();
      }, 100);

      console.log('[Task App] 任务应用初始化完成 - 版本 3.0');
    }

    // 设置上下文监控
    setupContextMonitor() {
      console.log('[Task App] 设置上下文监控...');

      // 不再使用定时检查，只通过事件监听
      // 监听SillyTavern的事件系统（MESSAGE_RECEIVED 和 CHAT_CHANGED）
      this.setupSillyTavernEventListeners();
    }

    // 手动刷新任务数据（在变量操作后调用）
    refreshTasksData() {
      console.log('[Task App] 🔄 手动刷新任务数据...');
                this.parseTasksFromContext();
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

          // 创建延迟刷新函数（只在消息接收后刷新）
          const handleMessageReceived = () => {
            console.log('[Task App] 📨 收到 MESSAGE_RECEIVED 事件，刷新任务数据...');
            setTimeout(() => {
              // 先解析数据
              this.parseTasksFromContext();

              // 如果应用当前处于活动状态，强制刷新UI
              const appContent = document.getElementById('app-content');
              if (appContent && appContent.querySelector('.task-list')) {
                console.log('[Task App] 🔄 强制刷新任务应用UI...');
                appContent.innerHTML = this.getAppContent();
                this.bindEvents();
              }
            }, 500);
          };

          // 只监听消息接收事件（AI回复后）
          if (event_types.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
            console.log('[Task App] ✅ 已注册 MESSAGE_RECEIVED 事件监听');
          }

          // 监听聊天变化事件（切换对话时）
          if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
              console.log('[Task App] 📨 聊天已切换，刷新任务数据...');
              setTimeout(() => {
                this.parseTasksFromContext();
              }, 500);
            });
            console.log('[Task App] ✅ 已注册 CHAT_CHANGED 事件监听');
          }

          // 保存引用以便后续清理
          this.messageReceivedHandler = handleMessageReceived;
        } else {
          // 减少重试频率，从2秒改为5秒
          setTimeout(() => {
            this.setupSillyTavernEventListeners();
          }, 5000);
        }
      } catch (error) {
        console.warn('[Task App] 设置SillyTavern事件监听器失败:', error);
      }
    }

    // 防抖函数
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // 从上下文解析任务信息
    parseTasksFromContext() {
      try {
        // 获取当前任务数据
        const taskData = this.getCurrentTaskData();

        // 检查任务状态是否有变化
        const tasksChanged = taskData.tasks.length !== this.tasks.length || this.hasTasksChanged(taskData.tasks);
        const acceptedChanged =
          JSON.stringify(taskData.acceptedTasks.sort()) !== JSON.stringify(this.acceptedTasks.sort());
        const completedChanged =
          JSON.stringify(taskData.completedTasks.sort()) !== JSON.stringify(this.completedTasks.sort());

        // 如果有任何变化，更新数据
        if (tasksChanged || acceptedChanged || completedChanged) {
          console.log('[Task App] 检测到任务状态变化:', {
            tasksChanged,
            acceptedChanged,
            completedChanged,
            oldAccepted: this.acceptedTasks,
            newAccepted: taskData.acceptedTasks,
            oldCompleted: this.completedTasks,
            newCompleted: taskData.completedTasks,
          });

          this.tasks = taskData.tasks;
          this.acceptedTasks = taskData.acceptedTasks;
          this.completedTasks = taskData.completedTasks;
          console.log('[Task App] 📋 任务数据已更新');

          // 只有在当前显示任务应用时才更新UI
          if (this.isCurrentlyActive()) {
            console.log('[Task App] 🎨 任务应用处于活动状态，更新UI...');
          this.updateTaskList();
          } else {
            console.log('[Task App] 💤 任务应用未激活，数据已更新但UI延迟渲染');
          }
        }
      } catch (error) {
        console.error('[Task App] 解析任务信息失败:', error);
      }
    }

    // 检查任务应用是否当前活动
    isCurrentlyActive() {
      const appContent = document.getElementById('app-content');
      if (!appContent) return false;

      // 检查是否包含任务应用的特征元素
      return appContent.querySelector('.task-tabs') !== null || appContent.querySelector('.task-list') !== null;
    }

    /**
     * 从变量管理器获取任务数据（使用 Mvu 框架 + 向上楼层查找）
     */
    getCurrentTaskData() {
      try {
        // 方法1: 使用 Mvu 框架获取变量（与shop-app一致：向上查找有变量的楼层）
        if (window.Mvu && typeof window.Mvu.getMvuData === 'function') {
          // 获取目标消息ID（向上查找最近有AI消息且有变量的楼层）
          let targetMessageId = 'latest';

          if (typeof window.getLastMessageId === 'function' && typeof window.getChatMessages === 'function') {
            let currentId = window.getLastMessageId();

            // 向上查找AI消息（跳过用户消息）
            while (currentId >= 0) {
              const message = window.getChatMessages(currentId).at(-1);
              if (message && message.role !== 'user') {
                targetMessageId = currentId;
                if (currentId !== window.getLastMessageId()) {
                  console.log(`[Task App] 📝 向上查找到第 ${currentId} 层的AI消息`);
                }
                break;
              }
              currentId--;
            }

            if (currentId < 0) {
              targetMessageId = 'latest';
              console.warn('[Task App] ⚠️ 没有找到AI消息，使用最后一层');
            }
          }

          console.log('[Task App] 使用消息ID:', targetMessageId);

          // 获取变量
          const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
          console.log('[Task App] 从 Mvu 获取变量数据:', mvuData);
          console.log('[Task App] stat_data 存在:', !!mvuData?.stat_data);
          if (mvuData?.stat_data) {
            console.log('[Task App] stat_data 的键:', Object.keys(mvuData.stat_data));
            console.log('[Task App] 任务是否存在:', !!mvuData.stat_data['任务']);
            if (mvuData.stat_data['任务']) {
              console.log('[Task App] 任务数据:', mvuData.stat_data['任务']);
            }
          }

          // 尝试从 stat_data 读取
          if (mvuData && mvuData.stat_data && mvuData.stat_data['任务']) {
            const taskData = mvuData.stat_data['任务'];
            console.log('[Task App] ✅ 从 stat_data 获取到任务数据:', taskData);
            return this.parseTaskData(taskData);
          }

          // 尝试从根级别读取（如果变量不在 stat_data 中）
          if (mvuData && mvuData['任务']) {
            const taskData = mvuData['任务'];
            console.log('[Task App] ✅ 从根级别获取到任务数据:', taskData);
            return this.parseTaskData(taskData);
          }

          // 如果 stat_data 为空但 variables 存在，尝试从 variables 获取
          if (mvuData && !mvuData.stat_data && window.SillyTavern) {
            const context = window.SillyTavern.getContext ? window.SillyTavern.getContext() : window.SillyTavern;
            if (context && context.chatMetadata && context.chatMetadata.variables) {
              const stat_data = context.chatMetadata.variables['stat_data'];
              if (stat_data && stat_data['任务']) {
                console.log('[Task App] 从 variables.stat_data 获取任务数据');
                return this.parseTaskData(stat_data['任务']);
              }
            }
          }
        }

        // 方法2: 尝试从 SillyTavern 的上下文获取（备用）
        if (window.SillyTavern) {
          const context = window.SillyTavern.getContext ? window.SillyTavern.getContext() : window.SillyTavern;
          if (context && context.chatMetadata && context.chatMetadata.variables) {
            // 尝试从 variables.stat_data 获取
            const stat_data = context.chatMetadata.variables['stat_data'];
            if (stat_data && stat_data['任务']) {
              console.log('[Task App] 从 context.chatMetadata.variables.stat_data 获取任务数据');
              return this.parseTaskData(stat_data['任务']);
            }

            // 尝试直接从 variables 获取
            const taskData = context.chatMetadata.variables['任务'];
            if (taskData && typeof taskData === 'object') {
              console.log('[Task App] 从 context.chatMetadata.variables 获取任务数据');
              return this.parseTaskData(taskData);
            }
          }
        }

        console.log('[Task App] 未找到任务数据');
      } catch (error) {
        console.warn('[Task App] 获取任务数据失败:', error);
      }

      return { tasks: [], acceptedTasks: [], completedTasks: [] };
    }

    /**
     * 解析任务数据
     * 任务结构：{ t001: {任务名称: [值, ''], 任务状态: [值, ''], 任务描述: [值, ''], 奖励: [值, '']}, ... }
     * 任务状态：未接受/进行中/已完成
     */
    parseTaskData(taskData) {
      const tasks = [];
      const acceptedTaskIds = [];
      const completedTaskIds = [];

      try {
        // 遍历任务中的所有任务
        Object.keys(taskData).forEach(taskKey => {
          // 跳过元数据
          if (taskKey === '$meta') return;

          const task = taskData[taskKey];
          if (!task || typeof task !== 'object') return;

          // 提取任务数据（变量格式：[值, 描述]）
          const getValue = (field) => task[field] && Array.isArray(task[field]) ? task[field][0] : '';

          const taskName = getValue('任务名称') || taskKey;
          const taskDescription = getValue('任务描述') || '';
          const taskStatus = getValue('任务状态') || '未接受';
          const taskReward = getValue('奖励') || '';

          if (!taskName) return;

          // 根据状态确定任务状态
          let status = 'available';
          if (taskStatus === '进行中') {
            status = 'inProgress';
            acceptedTaskIds.push(taskKey);
          } else if (taskStatus === '已完成') {
            status = 'completed';
            completedTaskIds.push(taskKey);
          }

          tasks.push({
            id: taskKey,
            name: taskName,
            description: taskDescription,
            publisher: '系统',
            reward: taskReward,
            status: status,
            timestamp: new Date().toLocaleString(),
          });
        });

        console.log('[Task App] 从任务解析完成，任务数:', tasks.length);
        console.log('[Task App] 未接受:', tasks.filter(t => t.status === 'available').length);
        console.log('[Task App] 进行中:', acceptedTaskIds.length);
        console.log('[Task App] 已完成:', completedTaskIds.length);
      } catch (error) {
        console.error('[Task App] 解析任务数据失败:', error);
      }

      return { tasks, acceptedTasks: acceptedTaskIds, completedTasks: completedTaskIds };
    }

    // 检查任务是否有变化
    hasTasksChanged(newTasks) {
      if (newTasks.length !== this.tasks.length) {
        return true;
      }

      for (let i = 0; i < newTasks.length; i++) {
        const newTask = newTasks[i];
        const oldTask = this.tasks[i];

        if (
          !oldTask ||
          newTask.id !== oldTask.id ||
          newTask.name !== oldTask.name ||
          newTask.description !== oldTask.description ||
          newTask.publisher !== oldTask.publisher ||
          newTask.reward !== oldTask.reward
        ) {
          return true;
        }
      }

      return false;
    }

    // 获取任务图标
    getTaskIcon(status) {
      const iconMap = {
        available: '📋',
        inProgress: '⏳',
        completed: '✅',
      };
      return iconMap[status] || iconMap['available'];
    }

    // 获取聊天数据
    getChatData() {
      try {
        // 优先使用mobileContextEditor获取数据
        const mobileContextEditor = window['mobileContextEditor'];
        if (mobileContextEditor) {
          const chatData = mobileContextEditor.getCurrentChatData();
          if (chatData && chatData.messages && chatData.messages.length > 0) {
            return chatData.messages;
          }
        }

        // 尝试从全局变量获取
        const chat = window['chat'];
        if (chat && Array.isArray(chat)) {
          return chat;
        }

        // 尝试从其他可能的位置获取
        const SillyTavern = window['SillyTavern'];
        if (SillyTavern && SillyTavern.chat) {
          return SillyTavern.chat;
        }

        return [];
      } catch (error) {
        console.error('[Task App] 获取聊天数据失败:', error);
        return [];
      }
    }

    // 获取应用内容
    getAppContent() {
      // 每次打开应用时重新解析一次数据（确保显示最新内容）
      const taskData = this.getCurrentTaskData();
      if (taskData.tasks.length !== this.tasks.length || this.hasTasksChanged(taskData.tasks)) {
        this.tasks = taskData.tasks;
        console.log('[Task App] 📋 打开应用时更新任务数据，任务数:', this.tasks.length);
      }

      switch (this.currentView) {
        case 'taskList':
          return this.renderTaskList();
        case 'inProgress':
          return this.renderInProgress();
        case 'completed':
          return this.renderCompleted();
        default:
          return this.renderTaskList();
      }
    }

    // 渲染任务列表
    renderTaskList() {
      console.log('[Task App] 渲染任务列表...');

      const availableTasks = this.tasks.filter(
        task => !this.acceptedTasks.includes(task.id) && !this.completedTasks.includes(task.id),
      );

      const inProgressTasks = this.tasks.filter(
        task => this.acceptedTasks.includes(task.id) && !this.completedTasks.includes(task.id),
      );

      const completedTasks = this.tasks.filter(task => this.completedTasks.includes(task.id));

      const taskItems = availableTasks
        .map(
          task => `
            <div class="task-item" data-task-id="${task.id}">
                <div class="task-info">
                    <div class="task-header-row">
                        <div class="task-name">${task.name}</div>
                        <button class="accept-task-btn" data-task-id="${task.id}">
                            接取任务
                        </button>
                    </div>
                    <div class="task-id">任务ID: ${task.id}</div>
                    <div class="task-description">${task.description}</div>
                    <div class="task-reward">奖励: ${task.reward}</div>
                    <div class="task-publisher">发布人: ${task.publisher}</div>
                </div>
            </div>
        `,
        )
        .join('');

      const emptyState = `
            <div class="task-empty-state">
                <div class="empty-icon">📋</div>
                <div class="empty-title">暂无可接任务</div>
            </div>
        `;

      return `
            <div class="task-app">
                <!-- 标签页导航 -->
                <div class="task-tabs">
                    <button class="task-tab ${this.currentView === 'taskList' ? 'active' : ''}" data-view="taskList">
                        任务 (${availableTasks.length})
                    </button>
                    <button class="task-tab ${
                      this.currentView === 'inProgress' ? 'active' : ''
                    }" data-view="inProgress">
                        进行中 (${inProgressTasks.length})
                    </button>
                    <button class="task-tab ${this.currentView === 'completed' ? 'active' : ''}" data-view="completed">
                        已完成 (${completedTasks.length})
                    </button>
                </div>

                <!-- 任务内容 -->
                <div class="task-list">
                    <div class="task-grid">
                        ${availableTasks.length > 0 ? taskItems : emptyState}
                    </div>
                </div>
            </div>
        `;
    }

    // 渲染进行中任务
    renderInProgress() {
      console.log('[Task App] 渲染进行中任务...');

      const availableTasks = this.tasks.filter(
        task => !this.acceptedTasks.includes(task.id) && !this.completedTasks.includes(task.id),
      );

      const inProgressTasks = this.tasks.filter(
        task => this.acceptedTasks.includes(task.id) && !this.completedTasks.includes(task.id),
      );

      const completedTasks = this.tasks.filter(task => this.completedTasks.includes(task.id));

      const taskItems = inProgressTasks
        .map(
          task => `
            <div class="task-item" data-task-id="${task.id}">
                <div class="task-info">
                    <div class="task-header-row">
                        <div class="task-name">${task.name}</div>
                        <div class="task-status">进行中</div>
                    </div>
                    <div class="task-id">任务ID: ${task.id}</div>
                    <div class="task-description">${task.description}</div>
                    <div class="task-reward">奖励: ${task.reward}</div>
                    <div class="task-publisher">发布人: ${task.publisher}</div>
                </div>
            </div>
        `,
        )
        .join('');

      const emptyState = `
            <div class="task-empty-state">
                <div class="empty-icon">⏳</div>
                <div class="empty-title">暂无进行中任务</div>
                <div class="empty-subtitle">快去接受一些任务吧</div>
                <button class="back-to-tasks-btn">查看可接任务</button>
            </div>
        `;

      return `
            <div class="task-app">
                <!-- 标签页导航 -->
                <div class="task-tabs">
                    <button class="task-tab ${this.currentView === 'taskList' ? 'active' : ''}" data-view="taskList">
                        任务 (${availableTasks.length})
                    </button>
                    <button class="task-tab ${
                      this.currentView === 'inProgress' ? 'active' : ''
                    }" data-view="inProgress">
                        进行中 (${inProgressTasks.length})
                    </button>
                    <button class="task-tab ${this.currentView === 'completed' ? 'active' : ''}" data-view="completed">
                        已完成 (${completedTasks.length})
                    </button>
                </div>

                <!-- 任务内容 -->
                <div class="task-list">
                    <div class="task-grid">
                        ${inProgressTasks.length > 0 ? taskItems : emptyState}
                    </div>
                </div>
            </div>
        `;
    }

    // 渲染已完成任务
    renderCompleted() {
      console.log('[Task App] 渲染已完成任务...');

      const availableTasks = this.tasks.filter(
        task => !this.acceptedTasks.includes(task.id) && !this.completedTasks.includes(task.id),
      );

      const inProgressTasks = this.tasks.filter(
        task => this.acceptedTasks.includes(task.id) && !this.completedTasks.includes(task.id),
      );

      const completedTasks = this.tasks.filter(task => this.completedTasks.includes(task.id));

      const taskItems = completedTasks
        .map(
          task => `
            <div class="task-item completed" data-task-id="${task.id}">
                <div class="task-info">
                    <div class="task-header-row">
                        <div class="task-name">${task.name}</div>
                        <div class="task-status">已完成</div>
                    </div>
                    <div class="task-id">任务ID: ${task.id}</div>
                    <div class="task-description">${task.description}</div>
                    <div class="task-reward">奖励: ${task.reward}</div>
                    <div class="task-publisher">发布人: ${task.publisher}</div>
                </div>
            </div>
        `,
        )
        .join('');

      const emptyState = `
            <div class="task-empty-state">
                <div class="empty-icon">✅</div>
                <div class="empty-title">暂无已完成任务</div>
                <div class="empty-subtitle">完成任务后会在这里显示</div>
                <button class="back-to-tasks-btn">查看可接任务</button>
            </div>
        `;

      return `
            <div class="task-app">
                <!-- 标签页导航 -->
                <div class="task-tabs">
                    <button class="task-tab ${this.currentView === 'taskList' ? 'active' : ''}" data-view="taskList">
                        任务 (${availableTasks.length})
                    </button>
                    <button class="task-tab ${
                      this.currentView === 'inProgress' ? 'active' : ''
                    }" data-view="inProgress">
                        进行中 (${inProgressTasks.length})
                    </button>
                    <button class="task-tab ${this.currentView === 'completed' ? 'active' : ''}" data-view="completed">
                        已完成 (${completedTasks.length})
                    </button>
                </div>

                <!-- 任务内容 -->
                <div class="task-list">
                    <div class="task-grid">
                        ${completedTasks.length > 0 ? taskItems : emptyState}
                    </div>
                </div>
            </div>
        `;
    }

    // 更新任务列表
    updateTaskList() {
      console.log('[Task App] 更新任务列表...');
      this.updateAppContent();
    }

    // 更新应用内容
    updateAppContent() {
      const content = this.getAppContent();
      const appElement = document.getElementById('app-content');
      if (appElement) {
        appElement.innerHTML = content;
        // 延迟绑定事件，确保DOM已更新
        setTimeout(() => {
          this.bindEvents();
        }, 50);
      }
    }

    // 绑定事件
    bindEvents() {
      console.log('[Task App] 绑定事件...');

      // 在应用容器内查找元素，避免与其他应用冲突
      const appContainer = document.getElementById('app-content');
      if (!appContainer) {
        console.error('[Task App] 应用容器未找到');
        return;
      }

      // 接受任务按钮点击事件
      appContainer.querySelectorAll('.accept-task-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const taskId = e.target.dataset.taskId;
          console.log('[Task App] 点击接受任务按钮:', taskId);
          this.acceptTask(taskId);
        });
      });

      // 返回任务列表按钮
      appContainer.querySelectorAll('.back-to-tasks-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[Task App] 点击返回任务列表按钮');
          this.showTaskList();
        });
      });

      // 标签页切换事件
      appContainer.querySelectorAll('.task-tab').forEach(tab => {
        tab.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const view = e.target.dataset.view;
          console.log('[Task App] 点击标签页:', view);
          this.switchView(view);
        });
      });

      // 刷新任务按钮事件
      appContainer.querySelectorAll('.refresh-tasks-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[Task App] 点击刷新任务按钮');
          this.refreshTaskList();
          this.showToast('正在刷新任务状态...', 'info');
        });
      });

      console.log(
        '[Task App] 事件绑定完成 - 标签页:',
        appContainer.querySelectorAll('.task-tab').length,
        '个, 刷新按钮:',
        appContainer.querySelectorAll('.refresh-tasks-btn').length,
        '个',
      );
    }

    // 接受任务（直接操作变量）
    async acceptTask(taskId) {
      console.log('[Task App] 接受任务:', taskId);

      const task = this.tasks.find(t => t.id === taskId && t.status === 'available');
      if (!task) {
        this.showToast('任务不存在或已接受', 'warning');
        return;
      }

      try {
        // 直接操作Mvu变量
        await this.acceptTaskDirectly(task);

        this.showToast('任务接受成功！', 'success');

        // 刷新任务列表
        this.refreshTasksData();
      } catch (error) {
        console.error('[Task App] 接受任务失败:', error);
        this.showToast('接受任务失败: ' + error.message, 'error');
      }
    }

    // 直接操作Mvu变量接受任务（修改任务状态）
    async acceptTaskDirectly(task) {
      try {
        console.log('[Task App] 开始直接更新变量...');

        // 获取目标消息ID
        let targetMessageId = 'latest';
        if (typeof window.getLastMessageId === 'function' && typeof window.getChatMessages === 'function') {
          let currentId = window.getLastMessageId();
          while (currentId >= 0) {
            const message = window.getChatMessages(currentId).at(-1);
            if (message && message.role !== 'user') {
              targetMessageId = currentId;
              break;
            }
            currentId--;
          }
        }

        // 获取Mvu数据
        const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
        if (!mvuData || !mvuData.stat_data) {
          throw new Error('无法获取Mvu变量数据');
        }

        // 确保任务存在
        if (!mvuData.stat_data['任务']) {
          throw new Error('任务系统不存在');
        }

        const taskKey = task.id;

        // 1. 修改任务状态为"进行中"
        await window.Mvu.setMvuVariable(mvuData, `任务.${taskKey}.任务状态[0]`, '进行中', {
          reason: `接受任务：${task.name}`,
          is_recursive: false
        });
        console.log(`[Task App] ✅ 任务状态更新: ${taskKey} -> 进行中`);

        // 2. 不再记录历史（由AI生成摘要代替）
        // 接受任务操作将在AI回复的摘要中体现

        // 保存更新
        await window.Mvu.replaceMvuData(mvuData, { type: 'message', message_id: targetMessageId });

        console.log('[Task App] ✅ 变量更新完成');
      } catch (error) {
        console.error('[Task App] 更新变量失败:', error);
        throw error;
      }
    }

    // 获取当前游戏时间（向上楼层查找AI消息）
    getCurrentGameTime() {
      try {
        // 使用 Mvu 框架获取变量（向上查找AI消息）
        if (window.Mvu && typeof window.Mvu.getMvuData === 'function') {
          let targetMessageId = 'latest';

          if (typeof window.getLastMessageId === 'function' && typeof window.getChatMessages === 'function') {
            let currentId = window.getLastMessageId();
            while (currentId >= 0) {
              const message = window.getChatMessages(currentId).at(-1);
              if (message && message.role !== 'user') {
                targetMessageId = currentId;
                break;
              }
              currentId--;
            }
          }

          const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
          if (mvuData && mvuData.stat_data && mvuData.stat_data['家族信息']) {
            const familyInfo = mvuData.stat_data['家族信息'];
            if (familyInfo.当前时间 && Array.isArray(familyInfo.当前时间)) {
              const timeValue = familyInfo.当前时间[0];
              if (timeValue) return timeValue;
            }
          }
        }

        // 备用方法：从 SillyTavern context 获取
        if (window.SillyTavern) {
          const context = window.SillyTavern.getContext ? window.SillyTavern.getContext() : window.SillyTavern;
          if (context && context.chatMetadata && context.chatMetadata.variables) {
            const familyInfo = context.chatMetadata.variables['家族信息'];
            if (familyInfo && familyInfo.当前时间 && Array.isArray(familyInfo.当前时间)) {
              const timeValue = familyInfo.当前时间[0];
              if (timeValue) return timeValue;
            }
          }
        }
      } catch (error) {
        console.warn('[Task App] 获取游戏时间失败:', error);
      }
      return '未知时间';
    }

    // 切换视图
    switchView(view) {
      console.log('[Task App] 切换视图:', view);
      this.currentView = view;
      this.updateAppContent();
      this.updateHeader();
    }

    // 显示任务列表
    showTaskList() {
      this.switchView('taskList');
    }

    // 显示进行中任务
    showInProgress() {
      this.switchView('inProgress');
    }

    // 显示已完成任务
    showCompleted() {
      this.switchView('completed');
    }

    // 发送查看任务消息
    sendViewTasksMessage() {
      try {
        console.log('[Task App] 发送查看任务消息');

        const message = '<Request:Meta-instructions：接下来你要，按照当前剧情，输出至少3个任务,注意更新对应变量,不要输出重复的任务，注意更新任务变量>查看任务';

        // 使用与消息app相同的发送方式
        this.sendToSillyTavern(message);
      } catch (error) {
        console.error('[Task App] 发送查看任务消息失败:', error);
      }
    }

    // 发送消息到SillyTavern
    async sendToSillyTavern(message) {
      try {
        console.log('[Task App] 发送消息到SillyTavern:', message);

        // 尝试找到文本输入框
        const textarea = document.querySelector('#send_textarea');
        if (!textarea) {
          console.error('[Task App] 未找到消息输入框');
          return this.sendToSillyTavernBackup(message);
        }

        // 设置消息内容
        textarea.value = message;
        textarea.focus();

        // 触发输入事件
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // 触发发送按钮点击
        const sendButton = document.querySelector('#send_but');
        if (sendButton) {
          sendButton.click();
          console.log('[Task App] 已点击发送按钮');
          return true;
        }

        return this.sendToSillyTavernBackup(message);
      } catch (error) {
        console.error('[Task App] 发送消息时出错:', error);
        return this.sendToSillyTavernBackup(message);
      }
    }

    // 备用发送方法
    async sendToSillyTavernBackup(message) {
      try {
        console.log('[Task App] 尝试备用发送方法:', message);

        const textareas = document.querySelectorAll('textarea');
        if (textareas.length > 0) {
          const textarea = textareas[0];
          textarea.value = message;
          textarea.focus();

          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return true;
        }

        return false;
      } catch (error) {
        console.error('[Task App] 备用发送方法失败:', error);
        return false;
      }
    }

    // 手动刷新任务列表
    refreshTaskList() {
      console.log('[Task App] 手动刷新任务列表');

      // 强制重新解析任务数据
      this.parseTasksFromContext();

      // 更新界面
      this.updateAppContent();

      // 显示刷新成功提示
      setTimeout(() => {
        this.showToast('任务状态已更新', 'success');
      }, 500);
    }

    // 销毁应用，清理资源
    destroy() {
      console.log('[Task App] 销毁应用，清理资源');

      // 清理事件监听
      if (this.eventListenersSetup && this.messageReceivedHandler) {
        const eventSource = window['eventSource'];
        if (eventSource && eventSource.removeListener) {
          eventSource.removeListener('MESSAGE_RECEIVED', this.messageReceivedHandler);
          console.log('[Task App] 🗑️ 已移除 MESSAGE_RECEIVED 事件监听');
        }
      }

      // 重置状态
      this.eventListenersSetup = false;
      this.isAutoRenderEnabled = false;

      // 清空数据
      this.tasks = [];
      this.acceptedTasks = [];
      this.completedTasks = [];
    }

    // 更新header
    updateHeader() {
      // 通知mobile-phone更新header
      if (window.mobilePhone && window.mobilePhone.updateAppHeader) {
        const state = {
          app: 'task',
          title: this.getViewTitle(),
          view: this.currentView,
        };
        window.mobilePhone.updateAppHeader(state);
      }
    }

    // 获取视图标题
    getViewTitle() {
      switch (this.currentView) {
        case 'taskList':
          return '任务大厅';
        case 'inProgress':
          return '进行中';
        case 'completed':
          return '已完成';
        default:
          return '任务大厅';
      }
    }

    // 显示提示消息
    showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `task-toast ${type}`;
      toast.textContent = message;

      document.body.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('show');
      }, 100);

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          toast.remove();
        }, 300);
      }, 3000);
    }
  }

  // 创建全局实例
  window.TaskApp = TaskApp;
  window.taskApp = new TaskApp();
} // 结束类定义检查

// 全局函数供调用
window.getTaskAppContent = function () {
  console.log('[Task App] 获取任务应用内容');

  if (!window.taskApp) {
    console.error('[Task App] taskApp实例不存在');
    return '<div class="error-message">任务应用加载失败</div>';
  }

  try {
    return window.taskApp.getAppContent();
  } catch (error) {
    console.error('[Task App] 获取应用内容失败:', error);
    return '<div class="error-message">任务应用内容加载失败</div>';
  }
};

window.bindTaskAppEvents = function () {
  console.log('[Task App] 绑定任务应用事件');

  if (!window.taskApp) {
    console.error('[Task App] taskApp实例不存在');
    return;
  }

  try {
    // 延迟绑定，确保DOM完全加载
    setTimeout(() => {
      window.taskApp.bindEvents();
    }, 100);
  } catch (error) {
    console.error('[Task App] 绑定事件失败:', error);
  }
};

window.taskAppShowInProgress = function () {
  if (window.taskApp) {
    window.taskApp.showInProgress();
  }
};

window.taskAppShowCompleted = function () {
  if (window.taskApp) {
    window.taskApp.showCompleted();
  }
};

window.taskAppRefresh = function () {
  if (window.taskApp) {
    window.taskApp.refreshTaskList();
  }
};

window.taskAppSendViewMessage = function () {
  if (window.taskApp) {
    window.taskApp.sendViewTasksMessage();
  }
};

window.taskAppDebugInfo = function () {
  if (window.taskApp) {
    console.log('[Task App Debug] 当前任务数量:', window.taskApp.tasks.length);
    console.log('[Task App Debug] 任务列表:', window.taskApp.tasks);
    console.log('[Task App Debug] 已接受任务:', window.taskApp.acceptedTasks);
    console.log('[Task App Debug] 已完成任务:', window.taskApp.completedTasks);
    console.log('[Task App Debug] 当前视图:', window.taskApp.currentView);
    console.log('[Task App Debug] 事件监听器设置:', window.taskApp.eventListenersSetup);
    console.log('[Task App Debug] 自动渲染启用:', window.taskApp.isAutoRenderEnabled);
  }
};

window.taskAppDestroy = function () {
  if (window.taskApp) {
    window.taskApp.destroy();
    console.log('[Task App] 应用已销毁');
  }
};

window.taskAppForceReload = function () {
  console.log('[Task App] 🔄 强制重新加载应用...');

  // 先销毁旧实例
  if (window.taskApp) {
    window.taskApp.destroy();
  }

  // 创建新实例
  window.taskApp = new TaskApp();
  console.log('[Task App] ✅ 应用已重新加载 - 版本 3.0');
};

window.taskAppForceRefresh = function () {
  console.log('[Task App] 🔄 强制刷新任务状态...');

  if (window.taskApp) {
    // 强制重新解析
    window.taskApp.parseTasksFromContext();
    window.taskApp.updateAppContent();
    window.taskApp.showToast('强制刷新完成', 'success');
  } else {
    console.error('[Task App] taskApp实例不存在');
  }
};

window.taskAppTestTabs = function () {
  console.log('[Task App] 🧪 测试标签页点击事件...');

  const tabs = document.querySelectorAll('.task-tab');
  console.log('[Task App] 找到标签页数量:', tabs.length);

  tabs.forEach((tab, index) => {
    console.log(`[Task App] 标签页 ${index + 1}:`, {
      text: tab.textContent.trim(),
      view: tab.dataset.view,
      active: tab.classList.contains('active'),
    });
  });

  if (tabs.length > 0) {
    console.log('[Task App] 尝试点击第二个标签页...');
    const secondTab = tabs[1];
    if (secondTab) {
      secondTab.click();
      console.log('[Task App] 已触发点击事件');
    }
  }
};

console.log('[Task App] 任务应用模块加载完成 - 版本 3.0 (事件驱动 + 族会目标 + 直接操作变量)');

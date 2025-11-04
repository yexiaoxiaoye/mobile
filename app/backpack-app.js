/**
 * Backpack App - 背包应用
 * 为mobile-phone.js提供背包功能
 * 基于shop-app的逻辑，专门处理背包物品
 */

// @ts-nocheck
// 避免重复定义
if (typeof window.BackpackApp === 'undefined') {
  class BackpackApp {
    constructor() {
      this.items = [];
      this.contextMonitor = null;
      this.lastItemCount = 0;
      this.isAutoRenderEnabled = true;
      this.lastRenderTime = 0;
      this.renderCooldown = 1000;
      this.eventListenersSetup = false;
      this.contextCheckInterval = null;

      // 分类和搜索相关属性
      this.currentItemType = 'all'; // 当前选中的物品类型
      this.showCategories = false; // 是否显示分类标签栏
      this.showSearchBar = false; // 是否显示搜索栏
      this.searchQuery = ''; // 搜索关键词
      this.searchDebounceTimer = null; // 搜索防抖定时器

      this.init();
    }

    init() {
      console.log('[Backpack App] 背包应用初始化开始 - 版本 2.1 (事件驱动刷新)');

      // 立即解析一次背包信息
      this.parseItemsFromContext();

      // 异步初始化监控，避免阻塞界面渲染
      setTimeout(() => {
        this.setupContextMonitor();
      }, 100);

      console.log('[Backpack App] 背包应用初始化完成 - 版本 2.1');
    }

    // 设置上下文监控
    setupContextMonitor() {
      console.log('[Backpack App] 设置上下文监控...');

      // 不再使用定时检查，只通过事件监听
      // 监听SillyTavern的事件系统（MESSAGE_RECEIVED 和 CHAT_CHANGED）
      this.setupSillyTavernEventListeners();
    }

    // 手动刷新背包数据（在变量操作后调用）
    refreshItemsData() {
      console.log('[Backpack App] 🔄 手动刷新背包数据...');
      this.parseItemsFromContext();
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
            console.log('[Backpack App] 📨 收到 MESSAGE_RECEIVED 事件，刷新背包数据...');
            setTimeout(() => {
              // 先解析数据
              this.parseItemsFromContext();

              // 如果应用当前处于活动状态，强制刷新UI
              const appContent = document.getElementById('app-content');
              if (appContent && appContent.querySelector('.backpack-item-list')) {
                console.log('[Backpack App] 🔄 强制刷新背包应用UI...');
                appContent.innerHTML = this.getAppContent();
                this.bindEvents();
              }
            }, 500);
          };

          // 只监听消息接收事件（AI回复后）
          if (event_types.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
            console.log('[Backpack App] ✅ 已注册 MESSAGE_RECEIVED 事件监听');
          }

          // 监听聊天变化事件（切换对话时）
          if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
              console.log('[Backpack App] 📨 聊天已切换，刷新背包数据...');
              setTimeout(() => {
                this.parseItemsFromContext();
              }, 500);
            });
            console.log('[Backpack App] ✅ 已注册 CHAT_CHANGED 事件监听');
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
        console.warn('[Backpack App] 设置SillyTavern事件监听器失败:', error);
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

    // 从上下文解析背包物品信息
    parseItemsFromContext() {
      try {
        // 获取当前背包数据
        const backpackData = this.getCurrentBackpackData();

        // 更新物品列表
        if (backpackData.items.length !== this.items.length || this.hasItemsChanged(backpackData.items)) {
          this.items = backpackData.items;
          console.log('[Backpack App] 📦 背包数据已更新，物品数:', this.items.length);

          // 只有在当前显示背包应用时才更新UI
          if (this.isCurrentlyActive()) {
            console.log('[Backpack App] 🎨 背包应用处于活动状态，更新UI...');
            this.updateItemList();
          } else {
            console.log('[Backpack App] 💤 背包应用未激活，数据已更新但UI延迟渲染');
          }
        }
      } catch (error) {
        console.error('[Backpack App] 解析背包物品信息失败:', error);
      }
    }

    // 检查背包应用是否当前活动
    isCurrentlyActive() {
      const appContent = document.getElementById('app-content');
      if (!appContent) return false;

      // 检查是否包含背包应用的特征元素
      return appContent.querySelector('.backpack-item-list') !== null;
    }

    /**
     * 从变量管理器获取背包数据（参考shop-app的getCurrentShopData方法）
     */
    getCurrentBackpackData() {
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
                  console.log(`[Backpack App] 📝 向上查找到第 ${currentId} 层的AI消息`);
                }
                break;
              }
              currentId--;
            }

            if (currentId < 0) {
              targetMessageId = 'latest';
              console.warn('[Backpack App] ⚠️ 没有找到AI消息，使用最后一层');
            }
          }

          console.log('[Backpack App] 使用消息ID:', targetMessageId);

          // 获取变量
          const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
          console.log('[Backpack App] 从 Mvu 获取变量数据:', mvuData);
          console.log('[Backpack App] stat_data 存在:', !!mvuData?.stat_data);
          if (mvuData?.stat_data) {
            console.log('[Backpack App] stat_data 的键:', Object.keys(mvuData.stat_data));
            console.log('[Backpack App] 道具是否存在:', !!mvuData.stat_data['道具']);
            if (mvuData.stat_data['道具']) {
              console.log('[Backpack App] 道具数据:', mvuData.stat_data['道具']);
            }
          }

          // 尝试从 stat_data 读取
          if (mvuData && mvuData.stat_data && mvuData.stat_data['道具']) {
            const backpackData = mvuData.stat_data['道具'];
            console.log('[Backpack App] ✅ 从 stat_data 获取到道具数据:', backpackData);
            return this.parseBackpackData(backpackData);
          }

          // 尝试从根级别读取（如果变量不在 stat_data 中）
          if (mvuData && mvuData['道具']) {
            const backpackData = mvuData['道具'];
            console.log('[Backpack App] ✅ 从根级别获取到道具数据:', backpackData);
            return this.parseBackpackData(backpackData);
          }

          // 如果 stat_data 为空但 variables 存在，尝试从 variables 获取
          if (mvuData && !mvuData.stat_data && window.SillyTavern) {
            const context = window.SillyTavern.getContext ? window.SillyTavern.getContext() : window.SillyTavern;
            if (context && context.chatMetadata && context.chatMetadata.variables) {
              const stat_data = context.chatMetadata.variables['stat_data'];
              if (stat_data && stat_data['道具']) {
                console.log('[Backpack App] 从 variables.stat_data 获取道具数据');
                return this.parseBackpackData(stat_data['道具']);
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
            if (stat_data && stat_data['道具']) {
              console.log('[Backpack App] 从 context.chatMetadata.variables.stat_data 获取道具数据');
              return this.parseBackpackData(stat_data['道具']);
            }

            // 尝试直接从 variables 获取
            const backpackData = context.chatMetadata.variables['道具'];
            if (backpackData && typeof backpackData === 'object') {
              console.log('[Backpack App] 从 context.chatMetadata.variables 获取道具数据');
              return this.parseBackpackData(backpackData);
            }
          }
        }

        console.log('[Backpack App] 未找到道具数据');
      } catch (error) {
        console.warn('[Backpack App] 获取背包数据失败:', error);
      }

      return { items: [] };
    }

    /**
     * 解析背包变量数据（动态读取所有分类）
     * 道具结构：{ 消耗品: {...}, 装备: {...}, 材料: {...}, ... }
     * 每个物品结构：{ 名称: [值, ''], 数量: [值, ''], 效果: [值, ''], 品质: [值, ''], ... }
     */
    parseBackpackData(backpackData) {
      const items = [];

      try {
        // 动态遍历所有分类（不预先定义，直接读取数据中的所有键）
        Object.keys(backpackData).forEach(category => {
          // 跳过元数据
          if (category === '$meta') return;

          const categoryData = backpackData[category];
          if (!categoryData || typeof categoryData !== 'object') return;

          // 遍历该分类下的所有物品
          Object.keys(categoryData).forEach(itemKey => {
            // 跳过元数据
            if (itemKey === '$meta') return;

            const item = categoryData[itemKey];
            if (!item || typeof item !== 'object') return;

            // 提取物品数据（变量格式：[值, 描述]）
            const getName = (field) => item[field] && Array.isArray(item[field]) ? item[field][0] : '';
            const getNumber = (field) => {
              const val = item[field] && Array.isArray(item[field]) ? item[field][0] : 0;
              return typeof val === 'number' ? val : parseFloat(val) || 0;
            };

            const name = getName('名称') || itemKey;
            const quantity = getNumber('数量');

            // 跳过无效物品（没有名称或数量为0）
            if (!name || quantity <= 0) return;

            // 尝试多个可能的描述字段
            const description = getName('效果') || getName('描述') || getName('作用') || getName('说明') || '暂无描述';
            const quality = getName('品质') || '普通';

            const newItem = {
              id: `${category}_${itemKey}_${Date.now()}`,
              name: name,
              type: category, // 使用分类作为类型
              description: description,
              quantity: quantity,
              image: this.getItemImage(category),
              quality: quality, // 品质
              category: category, // 原始分类
              itemKey: itemKey, // 保存键名，用于后续更新
              timestamp: new Date().toLocaleString(),
            };

            items.push(newItem);
          });
        });

        console.log('[Backpack App] 从道具解析完成，物品数:', items.length);
        if (items.length > 0) {
          console.log('[Backpack App] 物品分类:', [...new Set(items.map(i => i.type))]);
        }
      } catch (error) {
        console.error('[Backpack App] 解析道具数据失败:', error);
      }

      return { items };
    }

    /**
     * 从消息中实时解析背包内容（保留作为备用方法）
     */
    parseBackpackContent(content) {
      const items = [];

      // 解析背包格式: [背包|商品名|商品类型|商品描述|数量]（'背包'是固定标识符）
      const itemRegex = /\[背包\|([^\|]+)\|([^\|]+)\|([^\|]+)\|([^\]]+)\]/g;

      let itemMatch;
      while ((itemMatch = itemRegex.exec(content)) !== null) {
        const [fullMatch, name, type, description, quantity] = itemMatch;

        // 检查是否已存在相同物品（根据名称和类型判断）
        const existingItem = items.find(p => p.name.trim() === name.trim() && p.type.trim() === type.trim());

        if (existingItem) {
          // 如果已存在，累加数量
          existingItem.quantity += parseInt(quantity.trim()) || 1;
        } else {
          const newItem = {
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name.trim(),
            type: type.trim(),
            description: description.trim(),
            quantity: parseInt(quantity.trim()) || 1,
            image: this.getItemImage(type.trim()),
            timestamp: new Date().toLocaleString(),
          };
          items.push(newItem);
        }
      }

      console.log('[Backpack App] 解析完成，物品数:', items.length);
      return { items };
    }

    // 检查物品是否有变化（更高效的比较方法）
    hasItemsChanged(newItems) {
      if (newItems.length !== this.items.length) {
        return true;
      }

      for (let i = 0; i < newItems.length; i++) {
        const newItem = newItems[i];
        const oldItem = this.items[i];

        if (
          !oldItem ||
          newItem.name !== oldItem.name ||
          newItem.type !== oldItem.type ||
          newItem.description !== oldItem.description ||
          newItem.quantity !== oldItem.quantity
        ) {
          return true;
        }
      }

      return false;
    }

    // 获取物品图片（支持道具分类）
    getItemImage(type) {
      const imageMap = {
        // 手机系统分类
        消耗品: '💊',
        装备: '⚔️',
        材料: '📦',
        道具: '✨',
        // 玄鉴仙族分类
        灵资: '💎',
        法器: '⚔️',
        杂物: '📦',
        功法: '📜',
        法术: '✨',
        丹药: '💊',
        // 其他常见分类
        食品: '🍎',
        食物: '🍎',
        饮料: '🥤',
        服装: '👔',
        数码: '📱',
        家居: '🏠',
        美妆: '💄',
        运动: '⚽',
        图书: '📚',
        玩具: '🧸',
        音乐: '🎵',
        工具: '🔧',
        武器: '⚔️',
        药品: '💊',
        宝石: '💎',
        钥匙: '🔑',
        金币: '🪙',
        默认: '📦',
      };
      return imageMap[type] || imageMap['默认'];
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
        console.error('[Backpack App] 获取聊天数据失败:', error);
        return [];
      }
    }

    // 获取应用内容
    getAppContent() {
      // 每次打开应用时重新解析一次数据（确保显示最新内容）
      const backpackData = this.getCurrentBackpackData();
      if (backpackData.items.length !== this.items.length || this.hasItemsChanged(backpackData.items)) {
        this.items = backpackData.items;
        console.log('[Backpack App] 📦 打开应用时更新背包数据，物品数:', this.items.length);
      }

      return this.renderItemList();
    }

    // 渲染物品列表
    renderItemList() {
      console.log('[Backpack App] 渲染物品列表...');

      if (!this.items.length) {
        return `
                <div class="backpack-empty-state">
                    <div class="empty-icon" style="color: #333;">🎒</div>
                    <div class="empty-title" style="color: #333;">背包空空如也</div>
                </div>
            `;
      }

      // 计算总物品数
      const totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);

      // 获取所有物品类型
      const allTypes = ['all', ...new Set(this.items.map(item => item.type))];

      // 过滤物品（根据分类和搜索）
      const filteredItems = this.getFilteredItems();

      const itemCards = filteredItems
        .map(
          item => {
            // 判断是否是装备类物品（可以穿戴）
            const isEquipment = item.type === '装备';
            const actionButton = isEquipment
              ? `<button class="equip-item-btn" data-item-id="${item.id}" data-item-name="${item.name}">装备</button>`
              : `<button class="use-item-btn" data-item-id="${item.id}">使用</button>`;

            return `
            <div class="backpack-item" data-item-id="${item.id}">
                <div class="backpack-item-info">
                    <div class="backpack-item-header">
                        <div class="backpack-item-name">${item.name}</div>
                        <div class="backpack-item-type">${item.type}</div>
                    </div>
                    <div class="backpack-item-description">${item.description}</div>
                    <div class="backpack-item-footer">
                        <div class="backpack-item-quantity">数量: ${item.quantity}</div>
                        ${actionButton}
                    </div>
                </div>
            </div>
        `;
          }
        )
        .join('');

      // 渲染分类标签栏（可折叠）
      const categoryTabsHtml = this.showCategories
        ? `
          <div class="backpack-type-tabs">
              ${allTypes
                .map(
                  type => `
                  <button class="backpack-type-tab ${this.currentItemType === type ? 'active' : ''}"
                          data-type="${type}">
                      ${type === 'all' ? '全部' : type}
                  </button>
              `,
                )
                .join('')}
          </div>
      `
        : '';

      // 渲染搜索栏（可折叠）
      const searchBarHtml = this.showSearchBar
        ? `
          <div class="backpack-search-bar">
              <input type="text"
                     class="backpack-search-input"
                     placeholder="搜索物品名称或描述..."
                     value="${this.searchQuery}"
                     id="backpackSearchInput">
              <button class="backpack-search-clear" id="backpackSearchClear">✕</button>
          </div>
      `
        : '';

      return `
            <div class="backpack-item-list">
                <div class="backpack-header">
                    <div class="backpack-title">我的背包</div>
                    <div class="backpack-stats">共 ${this.items.length} 种物品，总计 ${totalItems} 件</div>
                </div>
                ${categoryTabsHtml}
                ${searchBarHtml}
                <div class="backpack-grid">
                    ${itemCards}
                </div>
            </div>
        `;
    }

    // 获取过滤后的物品列表
    getFilteredItems() {
      let filteredItems = this.items;

      // 根据分类过滤
      if (this.currentItemType !== 'all') {
        filteredItems = filteredItems.filter(item => item.type === this.currentItemType);
      }

      // 根据搜索关键词过滤
      if (this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase().trim();
        filteredItems = filteredItems.filter(
          item => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query),
        );
      }

      return filteredItems;
    }

    // 切换分类显示
    toggleCategories() {
      console.log('[Backpack App] 切换分类显示:', !this.showCategories);
      this.showCategories = !this.showCategories;
      this.updateAppContent();
    }

    // 切换搜索栏显示
    toggleSearchBar() {
      console.log('[Backpack App] 切换搜索栏显示:', !this.showSearchBar);
      this.showSearchBar = !this.showSearchBar;
      if (!this.showSearchBar) {
        this.searchQuery = ''; // 隐藏搜索栏时清空搜索
      }
      this.updateAppContent();

      // 如果显示搜索栏，聚焦到输入框
      if (this.showSearchBar) {
        setTimeout(() => {
          const searchInput = document.getElementById('backpackSearchInput');
          if (searchInput) {
            searchInput.focus();
          }
        }, 100);
      }
    }

    // 切换物品类型
    switchItemType(type) {
      console.log('[Backpack App] 切换物品类型:', type);
      this.currentItemType = type;
      this.updateAppContent();
    }

    // 执行搜索（带防抖）
    performSearch(query) {
      console.log('[Backpack App] 执行搜索:', query);

      // 清除之前的防抖定时器
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }

      // 设置新的防抖定时器
      this.searchDebounceTimer = setTimeout(() => {
        this.searchQuery = query;
        this.updateItemListOnly(); // 只更新物品列表，避免重新渲染搜索栏
      }, 300); // 300ms防抖延迟
    }

    // 立即执行搜索（不使用防抖）
    performSearchImmediate(query) {
      console.log('[Backpack App] 立即执行搜索:', query);
      this.searchQuery = query;
      this.updateItemListOnly(); // 只更新物品列表，不重新渲染整个页面
    }

    // 只更新物品列表（避免重新渲染搜索栏导致失去焦点）
    updateItemListOnly() {
      const backpackGrid = document.querySelector('.backpack-grid');
      if (!backpackGrid) {
        // 如果找不到网格容器，则进行完整更新
        this.updateAppContent();
        return;
      }

      // 获取过滤后的物品
      const filteredItems = this.getFilteredItems();

      // 生成新的物品卡片HTML
      const itemCards = filteredItems
        .map(
          item => `
            <div class="backpack-item" data-item-id="${item.id}">
                <div class="backpack-item-info">
                    <div class="backpack-item-header">
                        <div class="backpack-item-name">${item.name}</div>
                        <div class="backpack-item-type">${item.type}</div>
                    </div>
                    <div class="backpack-item-description">${item.description}</div>
                    <div class="backpack-item-footer">
                        <div class="backpack-item-quantity">数量: ${item.quantity}</div>
                        <button class="use-item-btn" data-item-id="${item.id}">使用</button>
                    </div>
                </div>
            </div>
        `,
        )
        .join('');

      // 更新物品网格内容
      backpackGrid.innerHTML = itemCards;

      // 重新绑定使用按钮事件
      this.bindUseItemEvents();
    }

    // 单独绑定使用物品按钮事件
    bindUseItemEvents() {
      document.querySelectorAll('.use-item-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const itemId = e.target?.getAttribute('data-item-id');
          this.useItem(itemId);
        });
      });
    }

    // 清空搜索
    clearSearch() {
      console.log('[Backpack App] 清空搜索');

      // 清除防抖定时器
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }

      this.searchQuery = '';
      this.updateAppContent();

      // 聚焦到搜索输入框
      setTimeout(() => {
        const searchInput = document.getElementById('backpackSearchInput');
        if (searchInput) {
          searchInput.value = ''; // 确保输入框也被清空
          searchInput.focus();
        }
      }, 100);
    }

    // 更新物品列表显示
    updateItemList() {
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

    // 绑定事件
    bindEvents() {
      console.log('[Backpack App] 绑定事件...');

      // 使用物品按钮
      document.querySelectorAll('.use-item-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation(); // 防止事件冒泡
          const itemId = e.target?.getAttribute('data-item-id');
          this.useItem(itemId);
        });
      });

      // 装备物品按钮
      document.querySelectorAll('.equip-item-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation(); // 防止事件冒泡
          const itemId = e.target?.getAttribute('data-item-id');
          const itemName = e.target?.getAttribute('data-item-name');
          this.equipItem(itemId, itemName);
        });
      });

      // 物品类型标签页切换
      document.querySelectorAll('.backpack-type-tab').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const type = e.target?.getAttribute('data-type');
          this.switchItemType(type);
        });
      });

      // 搜索输入框事件
      const searchInput = document.getElementById('backpackSearchInput');
      if (searchInput) {
        // 实时搜索（使用防抖）
        searchInput.addEventListener('input', e => {
          this.performSearch(e.target.value);
        });

        // 回车搜索（立即执行）
        searchInput.addEventListener('keypress', e => {
          if (e.key === 'Enter') {
            // 清除防抖定时器，立即执行搜索
            if (this.searchDebounceTimer) {
              clearTimeout(this.searchDebounceTimer);
            }
            this.performSearchImmediate(e.target.value);
          }
        });

        // 防止输入框失去焦点时的问题
        searchInput.addEventListener('blur', e => {
          // 延迟一点再执行，避免与其他事件冲突
          setTimeout(() => {
            if (this.searchQuery !== e.target.value) {
              this.performSearchImmediate(e.target.value);
            }
          }, 100);
        });
      }

      // 清空搜索按钮
      const clearBtn = document.getElementById('backpackSearchClear');
      if (clearBtn) {
        clearBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          this.clearSearch();
        });
      }
    }

    // 使用物品
    useItem(itemId) {
      const item = this.items.find(p => p.id === itemId);
      if (!item) return;

      this.showUseItemModal(item);
    }

    // 装备物品（穿到身上）
    async equipItem(itemId, itemName) {
      try {
        console.log('[Backpack App] 装备物品:', itemName);

        // 弹出选择装备部位的对话框
        const slot = await this.showEquipSlotModal(itemName);
        if (!slot) {
          console.log('[Backpack App] 用户取消装备');
          return;
        }

        console.log('[Backpack App] 选择装备到:', slot);

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

        // 1. 检查该部位是否已有装备
        const currentEquipment = mvuData.stat_data['用户']?.['当前着装']?.[slot]?.[0];
        if (currentEquipment && currentEquipment.trim() !== '') {
          const confirm = window.confirm(`该部位已装备"${currentEquipment}"，是否替换？\n（旧装备会返回背包）`);
          if (!confirm) {
            console.log('[Backpack App] 用户取消替换');
            return;
          }

          // 旧装备返回背包
          const backpackCategory = '装备';
          const backpackPath = `道具.${backpackCategory}`;
          const backpackItems = mvuData.stat_data['道具']?.[backpackCategory] || {};
          const newBackpackCategory = { ...backpackItems };

          if (newBackpackCategory[currentEquipment]) {
            const currentCount = newBackpackCategory[currentEquipment]['数量']?.[0] || 0;
            newBackpackCategory[currentEquipment] = {
              ...newBackpackCategory[currentEquipment],
              数量: [currentCount + 1, newBackpackCategory[currentEquipment]['数量']?.[1] || '']
            };
          } else {
            newBackpackCategory[currentEquipment] = {
              名称: [currentEquipment, ''],
              数量: [1, ''],
              效果: [`${slot}装备`, ''],
              品质: ['普通', '']
            };
          }

          await window.Mvu.setMvuVariable(mvuData, backpackPath, newBackpackCategory, {
            reason: `${currentEquipment}返回背包`,
            is_recursive: false
          });
          console.log('[Backpack App] 旧装备已返回背包:', currentEquipment);
        }

        // 2. 穿上新装备
        await window.Mvu.setMvuVariable(mvuData, `用户.当前着装.${slot}[0]`, itemName, {
          reason: `装备${itemName}`,
          is_recursive: false
        });
        console.log('[Backpack App] 已装备到', slot);

        // 3. 从背包移除（数量-1）
        const item = this.items.find(p => p.id === itemId);
        if (item) {
          const backpackCategory = item.type;
          const backpackPath = `道具.${backpackCategory}`;
          const backpackItems = mvuData.stat_data['道具']?.[backpackCategory] || {};
          const newBackpackCategory = { ...backpackItems };

          if (newBackpackCategory[itemName]) {
            const currentCount = newBackpackCategory[itemName]['数量']?.[0] || 0;
            if (currentCount <= 1) {
              // 数量为1，直接删除
              delete newBackpackCategory[itemName];
              console.log('[Backpack App] 物品已用完，从背包删除:', itemName);
            } else {
              // 数量减1
              newBackpackCategory[itemName] = {
                ...newBackpackCategory[itemName],
                数量: [currentCount - 1, newBackpackCategory[itemName]['数量']?.[1] || '']
              };
              console.log('[Backpack App] 物品数量-1:', itemName, '剩余:', currentCount - 1);
            }

            await window.Mvu.setMvuVariable(mvuData, backpackPath, newBackpackCategory, {
              reason: `装备${itemName}`,
              is_recursive: false
            });
          }
        }

        // 4. 不再记录历史（由AI生成摘要代替）
        // 装备操作将在AI回复的摘要中体现

        // 保存更新
        await window.Mvu.replaceMvuData(mvuData, { type: 'message', message_id: targetMessageId });

        console.log('[Backpack App] ✅ 装备成功');
        alert(`已将"${itemName}"装备到${slot}`);

        // 刷新显示
        setTimeout(() => {
          this.refreshItemsData();
          // 通知状态栏刷新
          if (window.statusApp && typeof window.statusApp.refreshStatusData === 'function') {
            window.statusApp.refreshStatusData();
          }
        }, 300);

      } catch (error) {
        console.error('[Backpack App] 装备失败:', error);
        alert('装备失败: ' + error.message);
      }
    }

    // 显示选择装备部位的对话框
    showEquipSlotModal(itemName) {
      return new Promise((resolve) => {
        const slots = ['头部', '耳朵', '上衣', '下装', '内衣', '内裤', '袜子', '鞋子'];

        // 创建模态框HTML
        const modalHtml = `
          <div class="backpack-equip-modal-overlay" id="equipModalOverlay">
            <div class="backpack-equip-modal">
              <div class="backpack-equip-modal-header">
                <h3>选择装备部位</h3>
                <button class="backpack-equip-modal-close" id="equipModalClose">✕</button>
              </div>
              <div class="backpack-equip-modal-body">
                <p>将"${itemName}"装备到：</p>
                <div class="backpack-equip-slot-list">
                  ${slots.map(slot => `
                    <button class="backpack-equip-slot-btn" data-slot="${slot}">${slot}</button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        `;

        // 添加到页面
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        // 绑定事件
        const overlay = document.getElementById('equipModalOverlay');
        const closeBtn = document.getElementById('equipModalClose');

        // 点击部位按钮
        document.querySelectorAll('.backpack-equip-slot-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const slot = e.target.getAttribute('data-slot');
            modalContainer.remove();
            resolve(slot);
          });
        });

        // 关闭按钮
        closeBtn.addEventListener('click', () => {
          modalContainer.remove();
          resolve(null);
        });

        // 点击遮罩层关闭
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            modalContainer.remove();
            resolve(null);
          }
        });
      });
    }

    // 显示使用物品弹窗
    showUseItemModal(item) {
      const modal = document.createElement('div');
      modal.className = 'custom-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">使用物品：${item.name}</h3>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">请输入要对谁使用该物品：</label>
              <input type="text" class="form-input" id="useTarget" placeholder="例如：自己、队友、敌人等">
            </div>
            <div class="form-group">
              <label class="form-label">请输入要如何使用该物品：</label>
              <input type="text" class="form-input" id="useMethod" placeholder="例如：直接食用、投掷、涂抹等">
            </div>
            <div class="form-group">
              <label class="form-label">使用数量：</label>
              <div class="quantity-control">
                <button class="quantity-btn" id="decreaseBtn">-</button>
                <div class="quantity-display" id="quantityDisplay">1</div>
                <button class="quantity-btn" id="increaseBtn">+</button>
              </div>
            </div>
            <div class="modal-actions">
              <button class="modal-btn btn-primary" id="confirmUse">使用</button>
              <button class="modal-btn btn-secondary" id="cancelUse">取消</button>
            </div>
          </div>
        </div>
      `;

      // 添加到app-content容器内，而不是document.body
      const appContent = document.getElementById('app-content');
      if (appContent) {
        appContent.appendChild(modal);
      } else {
        console.warn('[Backpack App] 未找到app-content容器，添加到body');
        document.body.appendChild(modal);
      }

      // 绑定事件
      let currentQuantity = 1;
      const maxQuantity = item.quantity;

      const quantityDisplay = modal.querySelector('#quantityDisplay');
      const decreaseBtn = modal.querySelector('#decreaseBtn');
      const increaseBtn = modal.querySelector('#increaseBtn');
      const confirmBtn = modal.querySelector('#confirmUse');
      const cancelBtn = modal.querySelector('#cancelUse');

      // 更新数量显示
      const updateQuantity = () => {
        quantityDisplay.textContent = currentQuantity;
        decreaseBtn.disabled = currentQuantity <= 1;
        increaseBtn.disabled = currentQuantity >= maxQuantity;
      };

      // 减少数量
      decreaseBtn.addEventListener('click', () => {
        if (currentQuantity > 1) {
          currentQuantity--;
          updateQuantity();
        }
      });

      // 增加数量
      increaseBtn.addEventListener('click', () => {
        if (currentQuantity < maxQuantity) {
          currentQuantity++;
          updateQuantity();
        }
      });

      // 确认使用
      confirmBtn.addEventListener('click', async () => {
        const target = modal.querySelector('#useTarget').value.trim();
        const method = modal.querySelector('#useMethod').value.trim();

        try {
          // 生成消息
          const message = await this.generateUseMessageWithContext(item, target, method, currentQuantity);
          this.sendToSillyTavern(message);

          this.showToast(`使用了 ${currentQuantity} 个 ${item.name}`, 'success');

          // 关闭弹窗
          modal.remove();

          // 刷新物品列表以反映数量变化
          setTimeout(() => {
            this.parseItemsFromContext();
          }, 500);
        } catch (error) {
          console.error('[Backpack App] 使用物品失败:', error);
          this.showToast('使用物品失败: ' + error.message, 'error');
        }
      });

      // 取消使用
      cancelBtn.addEventListener('click', () => {
        modal.remove();
      });

      // 点击背景关闭弹窗
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          modal.remove();
        }
      });

      // 初始化数量显示
      updateQuantity();
    }

    // 生成使用消息（带上下文编辑）
    async generateUseMessageWithContext(item, target, method, quantity) {
      try {
        // 先更新上下文中的背包格式（将原有物品标记为已使用）
        await this.updateBackpackItemInContext(item, quantity);

        // 生成基础消息
        let message = this.generateUseMessage(item, target, method, quantity);

        // 如果使用后还有剩余，添加剩余数量信息和新的背包格式
        const remainingQuantity = item.quantity - quantity;
        if (remainingQuantity > 0) {
          message += `。该物品在背包内的剩余数量为：${remainingQuantity}，[背包|${item.name}|${item.type}|${item.description}|${remainingQuantity}]`;
        }

        return message;
      } catch (error) {
        console.error('[Backpack App] 生成使用消息失败:', error);
        // 降级到原始消息生成
        return this.generateUseMessage(item, target, method, quantity);
      }
    }

    // 生成使用消息（原始方法）
    generateUseMessage(item, target, method, quantity) {
      let message = '';

      // 处理对谁使用
      if (target) {
        message += `用户选择对${target}使用了${item.name}`;
        if (quantity > 1) {
          message += `，使用数量为${quantity}`;
        }
      }

      // 处理如何使用
      if (method) {
        if (message) {
          message += '。';
        }
        message += `用户使用物品${item.name}，用法为${method}`;
        if (quantity > 1 && !target) {
          message += `。使用数量为${quantity}`;
        }
      }

      // 如果都没有填写，使用默认消息
      if (!target && !method) {
        message = `用户使用了${item.name}`;
        if (quantity > 1) {
          message += `，使用数量为${quantity}`;
        }
      }

      return message;
    }

    // 更新上下文中的背包物品格式
    async updateBackpackItemInContext(item, usedQuantity) {
      try {
        console.log('[Backpack App] 开始更新上下文中的背包物品格式');

        // 获取当前聊天数据
        const contextData = this.getChatData();
        if (!contextData || contextData.length === 0) {
          console.log('[Backpack App] 没有找到聊天数据');
          return;
        }

        // 查找包含该物品的消息
        let hasUpdated = false;
        const targetPattern = new RegExp(
          `\\[背包\\|${this.escapeRegex(item.name)}\\|([^\\|]+)\\|([^\\|]+)\\|(\\d+)\\]`,
          'g',
        );

        for (let i = 0; i < contextData.length; i++) {
          const message = contextData[i];
          const content = message.mes || message.content || '';

          if (content.includes(`[背包|${item.name}|`)) {
            // 转换格式
            const convertedContent = this.convertBackpackFormat(content, item, usedQuantity);

            if (convertedContent !== content) {
              // 更新消息内容
              const success = await this.updateMessageContent(i, convertedContent);
              if (success) {
                hasUpdated = true;
                console.log(`[Backpack App] 已更新消息 ${i}，物品: ${item.name}`);
                break; // 只更新第一个找到的消息
              }
            }
          }
        }

        if (hasUpdated) {
          // 保存聊天数据
          await this.saveChatData();
          console.log('[Backpack App] 背包物品格式更新完成并已保存');
        } else {
          console.log('[Backpack App] 没有找到需要更新的背包物品');
        }
      } catch (error) {
        console.error('[Backpack App] 更新背包物品格式失败:', error);
        throw error;
      }
    }

    // 转换背包格式
    convertBackpackFormat(content, item, usedQuantity) {
      // 创建正则表达式来匹配特定物品
      const itemPattern = new RegExp(
        `\\[背包\\|${this.escapeRegex(item.name)}\\|([^\\|]+)\\|([^\\|]+)\\|(\\d+)\\]`,
        'g',
      );

      let convertedContent = content;

      // 不管有无剩余，都将上下文中的物品标记为已使用，避免重复抓取
      convertedContent = convertedContent.replace(itemPattern, (match, type, description, quantity) => {
        return `[已使用|${item.name}|${type}|${description}|${usedQuantity}]`;
      });

      return convertedContent;
    }

    // 转义正则表达式特殊字符
    escapeRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 更新消息内容
    async updateMessageContent(messageIndex, newContent) {
      try {
        console.log(`[Backpack App] 正在更新消息 ${messageIndex}:`, newContent.substring(0, 100) + '...');

        // 方法1: 使用全局chat数组直接更新
        const chat = window['chat'];
        if (chat && Array.isArray(chat) && chat[messageIndex]) {
          const originalContent = chat[messageIndex].mes;
          chat[messageIndex].mes = newContent;

          // 如果消息有swipes，也需要更新
          if (chat[messageIndex].swipes && chat[messageIndex].swipe_id !== undefined) {
            chat[messageIndex].swipes[chat[messageIndex].swipe_id] = newContent;
          }

          // 标记聊天数据已被修改
          if (window.chat_metadata) {
            window.chat_metadata.tainted = true;
          }

          console.log(
            `[Backpack App] 已更新消息 ${messageIndex}，原内容长度:${originalContent.length}，新内容长度:${newContent.length}`,
          );
          return true;
        }

        // 方法2: 尝试通过编辑器功能更新
        if (window.mobileContextEditor && window.mobileContextEditor.modifyMessage) {
          await window.mobileContextEditor.modifyMessage(messageIndex, newContent);
          return true;
        }

        // 方法3: 尝试通过context-editor更新
        if (window.contextEditor && window.contextEditor.modifyMessage) {
          await window.contextEditor.modifyMessage(messageIndex, newContent);
          return true;
        }

        console.warn('[Backpack App] 没有找到有效的消息更新方法');
        return false;
      } catch (error) {
        console.error('[Backpack App] 更新消息内容失败:', error);
        return false;
      }
    }

    // 保存聊天数据
    async saveChatData() {
      try {
        console.log('[Backpack App] 开始保存聊天数据...');

        // 方法1: 使用SillyTavern的保存函数
        if (typeof window.saveChatConditional === 'function') {
          await window.saveChatConditional();
          console.log('[Backpack App] 已通过saveChatConditional保存聊天数据');
          return true;
        }

        // 方法2: 使用延迟保存
        if (typeof window.saveChatDebounced === 'function') {
          window.saveChatDebounced();
          console.log('[Backpack App] 已通过saveChatDebounced保存聊天数据');
          // 等待一下确保保存完成
          await new Promise(resolve => setTimeout(resolve, 1000));
          return true;
        }

        // 方法3: 使用编辑器的保存功能
        if (window.mobileContextEditor && typeof window.mobileContextEditor.saveChatData === 'function') {
          await window.mobileContextEditor.saveChatData();
          console.log('[Backpack App] 已通过mobileContextEditor保存聊天数据');
          return true;
        }

        // 方法4: 使用context-editor的保存功能
        if (window.contextEditor && typeof window.contextEditor.saveChatData === 'function') {
          await window.contextEditor.saveChatData();
          console.log('[Backpack App] 已通过contextEditor保存聊天数据');
          return true;
        }

        console.warn('[Backpack App] 没有找到有效的保存方法');
        return false;
      } catch (error) {
        console.error('[Backpack App] 保存聊天数据失败:', error);
        return false;
      }
    }

    // 统一的发送消息方法（参考shop-app的发送方式）
    async sendToSillyTavern(message) {
      try {
        console.log('[Backpack App] 🔄 发送消息到SillyTavern:', message);

        // 方法1: 直接使用DOM元素（与消息app相同的方式）
        const originalInput = document.getElementById('send_textarea');
        const sendButton = document.getElementById('send_but');

        if (!originalInput || !sendButton) {
          console.error('[Backpack App] 找不到输入框或发送按钮元素');
          return this.sendToSillyTavernBackup(message);
        }

        // 检查输入框是否可用
        if (originalInput.disabled) {
          console.warn('[Backpack App] 输入框被禁用');
          return false;
        }

        // 检查发送按钮是否可用
        if (sendButton.classList.contains('disabled')) {
          console.warn('[Backpack App] 发送按钮被禁用');
          return false;
        }

        // 设置值
        originalInput.value = message;
        console.log('[Backpack App] 已设置输入框值:', originalInput.value);

        // 触发输入事件
        originalInput.dispatchEvent(new Event('input', { bubbles: true }));
        originalInput.dispatchEvent(new Event('change', { bubbles: true }));

        // 延迟点击发送按钮
        await new Promise(resolve => setTimeout(resolve, 300));
        sendButton.click();
        console.log('[Backpack App] 已点击发送按钮');

        return true;
      } catch (error) {
        console.error('[Backpack App] 发送消息时出错:', error);
        return this.sendToSillyTavernBackup(message);
      }
    }

    // 备用发送方法
    async sendToSillyTavernBackup(message) {
      try {
        console.log('[Backpack App] 尝试备用发送方法:', message);

        // 尝试查找其他可能的输入框
        const textareas = document.querySelectorAll('textarea');

        if (textareas.length > 0) {
          const textarea = textareas[0];
          textarea.value = message;
          textarea.focus();

          // 模拟键盘事件
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return true;
        }

        return false;
      } catch (error) {
        console.error('[Backpack App] 备用发送方法失败:', error);
        return false;
      }
    }

    // 手动刷新物品列表
    refreshItemList() {
      console.log('[Backpack App] 手动刷新物品列表');
      this.parseItemsFromContext();
      this.updateAppContent();
    }

    // 销毁应用，清理资源
    destroy() {
      console.log('[Backpack App] 销毁应用，清理资源');

      // 清理事件监听
      if (this.eventListenersSetup && this.messageReceivedHandler) {
        const eventSource = window['eventSource'];
        if (eventSource && eventSource.removeListener) {
          eventSource.removeListener('MESSAGE_RECEIVED', this.messageReceivedHandler);
          console.log('[Backpack App] 🗑️ 已移除 MESSAGE_RECEIVED 事件监听');
        }
      }

      // 清理搜索防抖定时器
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }

      // 重置状态
      this.eventListenersSetup = false;
      this.isAutoRenderEnabled = false;

      // 清空数据
      this.items = [];
    }

    // 更新header
    updateHeader() {
      // 通知mobile-phone更新header
      if (window.mobilePhone && window.mobilePhone.updateAppHeader) {
        const state = {
          app: 'backpack',
          title: '我的背包',
          view: 'itemList',
        };
        window.mobilePhone.updateAppHeader(state);
      }
    }

    // 显示提示消息
    showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `backpack-toast ${type}`;
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
  window.BackpackApp = BackpackApp;
  window.backpackApp = new BackpackApp();
} // 结束类定义检查

// 全局函数供mobile-phone.js调用
window.getBackpackAppContent = function () {
  console.log('[Backpack App] 获取背包应用内容');

  if (!window.backpackApp) {
    console.error('[Backpack App] backpackApp实例不存在');
    return '<div class="error-message">背包应用加载失败</div>';
  }

  try {
    return window.backpackApp.getAppContent();
  } catch (error) {
    console.error('[Backpack App] 获取应用内容失败:', error);
    return '<div class="error-message">获取内容失败</div>';
  }
};

window.bindBackpackAppEvents = function () {
  console.log('[Backpack App] 绑定背包应用事件');

  if (!window.backpackApp) {
    console.error('[Backpack App] backpackApp实例不存在');
    return;
  }

  try {
    window.backpackApp.bindEvents();
  } catch (error) {
    console.error('[Backpack App] 绑定事件失败:', error);
  }
};

// 调试和测试功能
window.backpackAppRefresh = function () {
  if (window.backpackApp) {
    window.backpackApp.refreshItemList();
  }
};

window.backpackAppToggleCategories = function () {
  if (window.backpackApp) {
    window.backpackApp.toggleCategories();
  }
};

window.backpackAppToggleSearch = function () {
  if (window.backpackApp) {
    window.backpackApp.toggleSearchBar();
  }
};

window.backpackAppDebugInfo = function () {
  if (window.backpackApp) {
    console.log('[Backpack App Debug] 当前物品数量:', window.backpackApp.items.length);
    console.log('[Backpack App Debug] 物品列表:', window.backpackApp.items);
    console.log('[Backpack App Debug] 事件监听器设置:', window.backpackApp.eventListenersSetup);
    console.log('[Backpack App Debug] 自动渲染启用:', window.backpackApp.isAutoRenderEnabled);
  }
};

// 性能优化：销毁应用实例
window.backpackAppDestroy = function () {
  if (window.backpackApp) {
    window.backpackApp.destroy();
    console.log('[Backpack App] 应用已销毁');
  }
};

// 强制重新加载应用（清除缓存）
window.backpackAppForceReload = function () {
  console.log('[Backpack App] 🔄 强制重新加载应用...');

  // 销毁现有实例
  if (window.backpackApp) {
    window.backpackApp.destroy();
  }

  // 重新创建实例
  window.backpackApp = new BackpackApp();
  console.log('[Backpack App] ✅ 应用已重新加载 - 版本 2.1');
};

// 初始化
console.log('[Backpack App] 背包应用模块加载完成 - 版本 2.1 (事件驱动刷新 + 变量管理器读取)');

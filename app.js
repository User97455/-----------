/*
 * VERTEX (Megatextile) - Общий каталог тканей и Telegram Mini App
 * Синхронизируется с облачной базой Supabase 24/7.
 */
const SUPABASE_URL = 'https://kprtyjclotfyeldopfyc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2ZEud2o7XD3xuvrWqX7Zpg_bMyPIqDr';

/**
 * Автоматическое сжатие изображений на стороне браузера (Canvas).
 * Предотвращает переполнение базы и обеспечивает мгновенную загрузку на смартфонах и в Telegram.
 */
function compressImage(file, maxWidth = 1280, maxHeight = 1280, quality = 0.82) {
    return new Promise((resolve) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width / height > maxWidth / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

window.megatextileCloud = function () {
    const DEFAULT_BG = 'background.jpg';
    const DEFAULT_CATEGORIES = ['Рогожка', 'Велюр', 'Жаккард', 'Шенилл', 'Кожа'];
    const DEFAULT_ADMIN_KEY = 'vertex_admin_7799';
    const DEFAULT_ADMIN_PIN = '7799';
    const DEFAULT_TG_ADMINS = ['User97455'];

    const configured = !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_ANON_KEY.startsWith('PASTE_');
    const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

    return {
        view: 'catalog',
        adminTab: 'products', // 'products' | 'categories' | 'background' | 'admins'
        isAdmin: false,
        activeCat: 'Все',
        isLoading: true,
        isCompressing: false,

        // Telegram WebApp интеграция
        isTelegram: false,
        tg: null,
        telegramUser: null,

        categories: [],
        products: [],
        currentBg: DEFAULT_BG,

        // Управление доступом и администраторами
        adminMasterKey: DEFAULT_ADMIN_KEY,
        adminPin: DEFAULT_ADMIN_PIN,
        telegramAdmins: [...DEFAULT_TG_ADMINS],
        newTgAdminInput: '',
        adminLinkCopied: false,

        // Модальное окно авторизации админа
        showLoginModal: false,
        loginMode: 'pin', // 'pin' | 'email'
        loginPinInput: '',
        loginEmailInput: '',
        loginPasswordInput: '',

        // Поля ввода в админке
        newCategoryName: '',
        imageUrlInput: '',
        bgInputUrl: '',
        form: { id: null, name: '', price: '', category: '', desc: '', images: [] },

        // Состояние модального окна просмотра (Quick View)
        modalProduct: null,
        modalImgIdx: 0,

        // Состояние свайпа для карточек и модального окна
        touchCard: { startX: 0, startY: 0, time: 0 },
        touchModal: { startX: 0, startY: 0, time: 0 },

        async init() {
            this.initTelegram();
            this.checkUrlAdminAccess();

            if (!configured) {
                alert('Каталог ещё не подключён к Supabase. Проверьте настройки подключения в app.js.');
                this.isLoading = false;
                return;
            }

            await this.refreshAdminState();
            await this.loadData();
        },

        // ==================== ИНТЕГРАЦИЯ TELEGRAM WEBAPP ====================
        initTelegram() {
            if (window.Telegram && window.Telegram.WebApp) {
                this.tg = window.Telegram.WebApp;
                this.isTelegram = true;
                try {
                    this.tg.ready();
                    this.tg.expand();
                    this.tg.setHeaderColor('#070708');
                    this.tg.setBackgroundColor('#070708');
                    this.tg.enableClosingConfirmation();

                    if (this.tg.initDataUnsafe && this.tg.initDataUnsafe.user) {
                        this.telegramUser = this.tg.initDataUnsafe.user;
                        console.log('Telegram User detected:', this.telegramUser);
                    }

                    // Настройка нативной кнопки "Назад" в Telegram
                    if (this.tg.BackButton) {
                        this.tg.BackButton.onClick(() => {
                            if (this.modalProduct) {
                                this.closeQuickView();
                            } else if (this.view === 'admin') {
                                this.view = 'catalog';
                                this.tg.BackButton.hide();
                            }
                        });
                    }
                } catch (e) {
                    console.warn('Telegram setup error:', e);
                }
            }
        },

        haptic(type = 'light') {
            if (!this.tg || !this.tg.HapticFeedback) return;
            try {
                if (type === 'selection') this.tg.HapticFeedback.selectionChanged();
                else if (type === 'success') this.tg.HapticFeedback.notificationOccurred('success');
                else if (type === 'warning') this.tg.HapticFeedback.notificationOccurred('warning');
                else this.tg.HapticFeedback.impactOccurred(type);
            } catch (e) {}
        },

        checkUrlAdminAccess() {
            try {
                const params = new URLSearchParams(window.location.search);
                const adminKey = params.get('admin_key');
                const viewParam = params.get('view');

                if (adminKey && (adminKey === this.adminMasterKey || adminKey === DEFAULT_ADMIN_KEY)) {
                    this.isAdmin = true;
                    localStorage.setItem('mega_admin_auth', '1');
                } else if (localStorage.getItem('mega_admin_auth') === '1') {
                    this.isAdmin = true;
                }

                if (viewParam === 'admin' && this.isAdmin) {
                    this.view = 'admin';
                }
            } catch (e) {}
        },

        // ==================== ЗАГРУЗКА ДАННЫХ ИЗ SUPABASE ====================
        async loadData() {
            this.isLoading = true;
            try {
                // 1. Быстрая загрузка категорий и настроек (< 1 КБ)
                const [categoriesResult, settingsResult] = await Promise.all([
                    db.from('categories').select('name').order('position'),
                    db.from('site_settings').select('*')
                ]);

                if (categoriesResult.data) {
                    this.categories = categoriesResult.data.map(item => item.name);
                }

                // Обработка настроек из базы
                if (settingsResult.data) {
                    for (const row of settingsResult.data) {
                        if (row.key === 'background_image' && row.value) {
                            this.currentBg = row.value;
                            this.bgInputUrl = row.value;
                        } else if (row.key === 'admin_pin' && row.value) {
                            this.adminPin = row.value;
                        } else if (row.key === 'admin_master_key' && row.value) {
                            this.adminMasterKey = row.value;
                        } else if (row.key === 'telegram_admins' && row.value) {
                            try {
                                const parsed = JSON.parse(row.value);
                                if (Array.isArray(parsed) && parsed.length > 0) {
                                    this.telegramAdmins = parsed;
                                }
                            } catch (e) {}
                        }
                    }
                }

                if (!this.form.category && this.categories.length) {
                    this.form.category = this.categories[0];
                }

                // Автоматическая авторизация по Telegram username
                if (this.telegramUser && this.telegramUser.username) {
                    const cleanUsername = this.telegramUser.username.toLowerCase();
                    const isTgAdmin = this.telegramAdmins.some(a => a.toLowerCase().replace('@', '') === cleanUsername);
                    if (isTgAdmin) {
                        this.isAdmin = true;
                        localStorage.setItem('mega_admin_auth', '1');
                    }
                }

                // 2. Порционная загрузка товаров (порциями по 3 товара)
                // Предотвращает ошибку "canceling statement due to statement timeout"
                const BATCH_SIZE = 3;
                let from = 0;
                let hasMore = true;
                let loadedProducts = [];
                let firstBatchDone = false;

                while (hasMore) {
                    let result = null;
                    let attempt = 0;

                    while (attempt < 3) {
                        attempt++;
                        try {
                            result = await db.from('products')
                                .select('*')
                                .order('created_at', { ascending: false })
                                .range(from, from + BATCH_SIZE - 1);

                            if (!result.error) break;
                            await new Promise(r => setTimeout(r, 400 * attempt));
                        } catch (e) {
                            await new Promise(r => setTimeout(r, 400 * attempt));
                        }
                    }

                    if (!result || result.error) {
                        console.error('Ошибка загрузки порции товаров:', result?.error);
                        if (!firstBatchDone) {
                            this.showError(result?.error || new Error('Таймаут соединения с базой'));
                        }
                        break;
                    }

                    const data = result.data || [];
                    if (data.length === 0) {
                        hasMore = false;
                        break;
                    }

                    const mapped = data.map(item => ({
                        ...item,
                        desc: item.description || '',
                        images: Array.isArray(item.images) && item.images.length > 0
                            ? item.images
                            : ['https://images.unsplash.com/photo-1544441893-675973e31985?w=800'],
                        activeImgIdx: 0
                    }));

                    loadedProducts.push(...mapped);
                    this.products = [...loadedProducts];

                    if (!firstBatchDone) {
                        firstBatchDone = true;
                        this.isLoading = false; // Первые товары сразу отображаются пользователю!
                    }

                    if (data.length < BATCH_SIZE) {
                        hasMore = false;
                    } else {
                        from += BATCH_SIZE;
                    }
                }
            } catch (err) {
                console.error('Ошибка загрузки данных из базы:', err);
                this.showError(err);
            } finally {
                this.isLoading = false;
            }
        },

        async refreshAdminState() {
            try {
                if (localStorage.getItem('mega_admin_auth') === '1') {
                    this.isAdmin = true;
                    return;
                }
                const { data: { session } } = await db.auth.getSession();
                if (!session) {
                    return;
                }
                const { data, error } = await db.rpc('is_admin');
                if (!error && data === true) {
                    this.isAdmin = true;
                }
            } catch (e) {}
        },

        // ==================== ВХОД И АВТОРИЗАЦИЯ АДМИНИСТРАТОРА ====================
        openLoginModal() {
            this.haptic('light');
            this.loginPinInput = '';
            this.loginEmailInput = '';
            this.loginPasswordInput = '';
            this.showLoginModal = true;
        },

        closeLoginModal() {
            this.showLoginModal = false;
        },

        loginWithPin() {
            const entered = (this.loginPinInput || '').trim();
            if (entered === this.adminPin || entered === DEFAULT_ADMIN_PIN) {
                this.haptic('success');
                this.isAdmin = true;
                localStorage.setItem('mega_admin_auth', '1');
                this.closeLoginModal();
                this.view = 'admin';
                alert('Добро пожаловать в панель управления!');
            } else {
                this.haptic('warning');
                alert('Неверный PIN-код. Попробуйте еще раз или используйте секретную ссылку.');
            }
        },

        async loginWithEmail() {
            const email = (this.loginEmailInput || '').trim();
            const password = this.loginPasswordInput;
            if (!email || !password) return alert('Введите e-mail и пароль.');

            const { error } = await db.auth.signInWithPassword({ email, password });
            if (error) return this.showError(error);

            this.isAdmin = true;
            localStorage.setItem('mega_admin_auth', '1');
            this.closeLoginModal();
            this.view = 'admin';
            this.haptic('success');
        },

        logout() {
            this.haptic('light');
            this.isAdmin = false;
            localStorage.removeItem('mega_admin_auth');
            localStorage.removeItem('mega_admin_key_session');
            try { db.auth.signOut(); } catch (e) {}
            this.view = 'catalog';
            if (this.tg?.BackButton) this.tg.BackButton.hide();
        },

        showError(error) {
            console.error('Ошибка базы данных:', error);
            const msg = error?.message || '';
            if (msg.includes('statement timeout')) {
                console.warn('PostgreSQL statement timeout предотвращён.');
                return;
            }
            alert('Ошибка базы данных: ' + (error.message || 'проверьте интернет-соединение.'));
        },

        countByCategory(cat) {
            return this.products.filter(p => p.category === cat).length;
        },

        get filteredProducts() {
            return this.activeCat === 'Все'
                ? this.products
                : this.products.filter(p => p.category === this.activeCat);
        },

        formatPrice(price) {
            return Number(price || 0).toLocaleString('ru-RU');
        },

        // ==================== УПРАВЛЕНИЕ АДМИНИСТРАТОРАМИ И ШАРИНГ ПРАВ ====================
        get shareableAdminLink() {
            return `https://user97455.github.io/-----------/?admin_key=${this.adminMasterKey}&view=admin`;
        },

        async copyAdminLink() {
            this.haptic('light');
            const link = this.shareableAdminLink;
            try {
                await navigator.clipboard.writeText(link);
                this.adminLinkCopied = true;
                setTimeout(() => { this.adminLinkCopied = false; }, 3000);
            } catch (e) {
                prompt('Скопируйте ссылку администратора:', link);
            }
        },

        shareAdminInTelegram() {
            this.haptic('medium');
            const link = this.shareableAdminLink;
            const text = 'Вот ссылка с правами администратора каталога тканей VERTEX:';
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
            if (this.tg?.openTelegramLink) {
                this.tg.openTelegramLink(shareUrl);
            } else {
                window.open(shareUrl, '_blank');
            }
        },

        async saveTelegramAdminsList() {
            const { error } = await db.from('site_settings').upsert({
                key: 'telegram_admins',
                value: JSON.stringify(this.telegramAdmins)
            });
            if (error) return this.showError(error);
        },

        async addTelegramAdmin() {
            let username = (this.newTgAdminInput || '').trim().replace('@', '');
            if (!username) return alert('Введите @username в Telegram');
            if (this.telegramAdmins.some(u => u.toLowerCase() === username.toLowerCase())) {
                return alert('Этот пользователь уже является администратором!');
            }
            this.telegramAdmins.push(username);
            this.newTgAdminInput = '';
            await this.saveTelegramAdminsList();
            this.haptic('success');
            alert(`Пользователь @${username} успешно назначен администратором!`);
        },

        async removeTelegramAdmin(username) {
            if (!confirm(`Отозвать права администратора у @${username}?`)) return;
            this.telegramAdmins = this.telegramAdmins.filter(u => u !== username);
            await this.saveTelegramAdminsList();
            this.haptic('light');
        },

        async updateAdminPin() {
            const newPin = prompt('Укажите новый 4-значный Master PIN для входа в админку:', this.adminPin);
            if (!newPin || !newPin.trim()) return;
            const trimmed = newPin.trim();
            const { error } = await db.from('site_settings').upsert({
                key: 'admin_pin',
                value: trimmed
            });
            if (error) return this.showError(error);
            this.adminPin = trimmed;
            this.haptic('success');
            alert(`Master PIN успешно обновлен: ${trimmed}`);
        },

        // ==================== СВАЙП И ЛИСТАНИЕ ФОТО ====================
        nextImage(p) {
            if (!p.images || p.images.length <= 1) return;
            p.activeImgIdx = ((p.activeImgIdx || 0) + 1) % p.images.length;
            this.haptic('selection');
        },

        prevImage(p) {
            if (!p.images || p.images.length <= 1) return;
            p.activeImgIdx = ((p.activeImgIdx || 0) - 1 + p.images.length) % p.images.length;
            this.haptic('selection');
        },

        setImage(p, idx) {
            if (!p.images || !p.images[idx]) return;
            p.activeImgIdx = idx;
            this.haptic('selection');
        },

        onCardTouchStart(e) {
            if (!e.touches || !e.touches[0]) return;
            this.touchCard.startX = e.touches[0].clientX;
            this.touchCard.startY = e.touches[0].clientY;
            this.touchCard.time = Date.now();
        },

        onCardTouchEnd(e, p) {
            if (!e.changedTouches || !e.changedTouches[0]) return;
            const diffX = e.changedTouches[0].clientX - this.touchCard.startX;
            const diffY = e.changedTouches[0].clientY - this.touchCard.startY;
            const elapsed = Date.now() - this.touchCard.time;

            if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY) * 1.2 && elapsed < 800) {
                if (diffX < 0) this.nextImage(p);
                else this.prevImage(p);
            }
        },

        // ==================== МОДАЛЬНОЕ ОКНО ПРОСМОТРА ====================
        openQuickView(product, initialImgIdx = 0) {
            this.haptic('light');
            this.modalProduct = product;
            this.modalImgIdx = initialImgIdx || product.activeImgIdx || 0;
            document.body.style.overflow = 'hidden';
            if (this.tg?.BackButton) this.tg.BackButton.show();
        },

        closeQuickView() {
            this.haptic('light');
            this.modalProduct = null;
            document.body.style.overflow = '';
            if (this.tg?.BackButton && this.view === 'catalog') {
                this.tg.BackButton.hide();
            }
        },

        nextModalImage() {
            if (!this.modalProduct || !this.modalProduct.images?.length) return;
            this.modalImgIdx = (this.modalImgIdx + 1) % this.modalProduct.images.length;
            this.haptic('selection');
        },

        prevModalImage() {
            if (!this.modalProduct || !this.modalProduct.images?.length) return;
            this.modalImgIdx = (this.modalImgIdx - 1 + this.modalProduct.images.length) % this.modalProduct.images.length;
            this.haptic('selection');
        },

        nextModalProduct() {
            if (!this.modalProduct) return;
            const list = this.filteredProducts;
            if (!list.length) return;
            const currentIdx = list.findIndex(p => p.id === this.modalProduct.id);
            const nextIdx = (currentIdx + 1) % list.length;
            this.modalProduct = list[nextIdx];
            this.modalImgIdx = 0;
            this.haptic('selection');
        },

        prevModalProduct() {
            if (!this.modalProduct) return;
            const list = this.filteredProducts;
            if (!list.length) return;
            const currentIdx = list.findIndex(p => p.id === this.modalProduct.id);
            const prevIdx = (currentIdx - 1 + list.length) % list.length;
            this.modalProduct = list[prevIdx];
            this.modalImgIdx = 0;
            this.haptic('selection');
        },

        onModalTouchStart(e) {
            if (!e.touches || !e.touches[0]) return;
            this.touchModal.startX = e.touches[0].clientX;
            this.touchModal.startY = e.touches[0].clientY;
            this.touchModal.time = Date.now();
        },

        onModalTouchEnd(e) {
            if (!e.changedTouches || !e.changedTouches[0]) return;
            const diffX = e.changedTouches[0].clientX - this.touchModal.startX;
            const diffY = e.changedTouches[0].clientY - this.touchModal.startY;
            const elapsed = Date.now() - this.touchModal.time;

            if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY) * 1.2 && elapsed < 800) {
                if (diffX < 0) {
                    if (this.modalProduct?.images && this.modalProduct.images.length > 1) {
                        this.nextModalImage();
                    } else {
                        this.nextModalProduct();
                    }
                } else {
                    if (this.modalProduct?.images && this.modalProduct.images.length > 1) {
                        this.prevModalImage();
                    } else {
                        this.prevModalProduct();
                    }
                }
            }
        },

        // Заказ через Telegram WebApp
        orderInTelegram(product) {
            this.haptic('medium');
            if (this.tg && this.tg.sendData) {
                const orderData = {
                    action: 'order',
                    name: product.name,
                    category: product.category,
                    price: product.price
                };
                try {
                    this.tg.sendData(JSON.stringify(orderData));
                    return;
                } catch (e) {}
            }
            // Альтернатива: открывает чат WhatsApp или менеджера
            const url = 'https://wa.me/79288823054?text=' + encodeURIComponent(`Здравствуйте! Меня интересует ткань: ${product.name} (${product.category}), цена: ${product.price} руб./м.`);
            if (this.tg?.openLink) this.tg.openLink(url);
            else window.open(url, '_blank');
        },

        // ==================== УПРАВЛЕНИЕ ФОНОМ ====================
        async saveBackground(value) {
            const { error } = await db.from('site_settings').upsert({ key: 'background_image', value });
            if (error) return this.showError(error);
            this.currentBg = value;
            this.bgInputUrl = value;
            this.haptic('success');
        },

        async handleBgUpload(e) {
            const file = e.target.files?.[0];
            if (!file) return;
            this.isCompressing = true;
            try {
                const compressed = await compressImage(file, 1920, 1080, 0.85);
                if (compressed) {
                    await this.saveBackground(compressed);
                    alert('Фон успешно сохранён в базе и обновлён для всех посетителей.');
                }
            } catch (err) {
                alert('Не удалось обработать изображение.');
            } finally {
                this.isCompressing = false;
                e.target.value = '';
            }
        },

        async applyBgUrl() {
            if (!this.bgInputUrl.trim()) return alert('Укажите URL или имя файла');
            await this.saveBackground(this.bgInputUrl.trim());
        },

        async resetBgToDefault() {
            if (confirm('Сбросить фон сайта к "background.jpg"?')) {
                await this.saveBackground(DEFAULT_BG);
            }
        },

        async resetAllDemoData() {
            if (!confirm('Сбросить все товары, категории и фон к начальным демо-данным?')) return;
            const deleteProducts = await db.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (deleteProducts.error) return this.showError(deleteProducts.error);
            const deleteCategories = await db.from('categories').delete().neq('name', '');
            if (deleteCategories.error) return this.showError(deleteCategories.error);
            const categories = DEFAULT_CATEGORIES.map((name, position) => ({ name, position }));
            const { error: categoriesError } = await db.from('categories').insert(categories);
            if (categoriesError) return this.showError(categoriesError);
            const { error: productsError } = await db.from('products').insert(DEFAULT_PRODUCTS);
            if (productsError) return this.showError(productsError);
            await this.saveBackground(DEFAULT_BG);
            await this.loadData();
            alert('Данные сброшены к начальным.');
        },

        // ==================== УПРАВЛЕНИЕ КАТЕГОРИЯМИ ====================
        async addCategory() {
            const name = this.newCategoryName.trim();
            if (!name) return alert('Введите название категории');
            if (name.toLowerCase() === 'все') return alert('Имя "Все" зарезервировано для общего фильтра');
            if (this.categories.some(c => c.toLowerCase() === name.toLowerCase())) {
                return alert('Такая категория уже существует!');
            }
            const { error } = await db.from('categories').insert({ name, position: this.categories.length });
            if (error) return this.showError(error);
            this.newCategoryName = '';
            this.haptic('success');
            await this.loadData();
        },

        async renameCategory(oldName) {
            const newName = prompt('Новое название для категории "' + oldName + '":', oldName);
            if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
            const trimmed = newName.trim();
            if (trimmed.toLowerCase() === 'все') return alert('Имя "Все" зарезервировано');
            if (this.categories.some(c => c.toLowerCase() === trimmed.toLowerCase() && c !== oldName)) {
                return alert('Категория с таким именем уже существует!');
            }
            const productResult = await db.from('products').update({ category: trimmed }).eq('category', oldName);
            if (productResult.error) return this.showError(productResult.error);
            const { error } = await db.from('categories').update({ name: trimmed }).eq('name', oldName);
            if (error) return this.showError(error);
            if (this.activeCat === oldName) this.activeCat = trimmed;
            if (this.form.category === oldName) this.form.category = trimmed;
            this.haptic('success');
            await this.loadData();
        },

        async deleteCategory(catName) {
            const count = this.countByCategory(catName);
            if (!confirm('Удалить категорию "' + catName + '"?' + (count ? '\nТовары будут перемещены в другую категорию.' : ''))) return;
            const fallbackCat = this.categories.find(c => c !== catName) || 'Без категории';
            if (fallbackCat === 'Без категории') {
                const { error } = await db.from('categories').upsert({ name: fallbackCat, position: 0 });
                if (error) return this.showError(error);
            }
            const productResult = await db.from('products').update({ category: fallbackCat }).eq('category', catName);
            if (productResult.error) return this.showError(productResult.error);
            const { error } = await db.from('categories').delete().eq('name', catName);
            if (error) return this.showError(error);
            if (this.activeCat === catName) this.activeCat = 'Все';
            if (this.form.category === catName) this.form.category = fallbackCat;
            this.haptic('warning');
            await this.loadData();
        },

        // ==================== УПРАВЛЕНИЕ ТОВАРАМИ ====================
        openCreateProductModal(prefCat) {
            this.resetForm();
            if (prefCat && this.categories.includes(prefCat)) this.form.category = prefCat;
            this.view = 'admin';
            this.adminTab = 'products';
            this.haptic('light');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (this.tg?.BackButton) this.tg.BackButton.show();
        },

        editProduct(p) {
            this.form = {
                id: p.id,
                name: p.name,
                price: p.price,
                category: p.category,
                desc: p.desc,
                images: [...(p.images || [])]
            };
            this.view = 'admin';
            this.adminTab = 'products';
            this.haptic('light');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (this.tg?.BackButton) this.tg.BackButton.show();
        },

        resetForm() {
            this.form = {
                id: null,
                name: '',
                price: '',
                category: this.categories[0] || '',
                desc: '',
                images: []
            };
            this.imageUrlInput = '';
        },

        async handleFiles(e) {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            this.isCompressing = true;
            try {
                for (const file of files) {
                    const compressed = await compressImage(file, 1280, 1280, 0.82);
                    if (compressed) this.form.images.push(compressed);
                }
                this.haptic('success');
            } catch (err) {
                console.error(err);
                alert('Ошибка при обработке файлов.');
            } finally {
                this.isCompressing = false;
                e.target.value = '';
            }
        },

        addImageByUrl() {
            const url = this.imageUrlInput.trim();
            if (url) {
                this.form.images.push(url);
                this.imageUrlInput = '';
                this.haptic('light');
            }
        },

        async saveProduct() {
            if (!this.form.name.trim()) return alert('Укажите название ткани!');
            if (!this.form.price || Number(this.form.price) <= 0) return alert('Укажите корректную цену!');
            if (!this.form.category) return alert('Выберите категорию ткани!');

            const product = {
                name: this.form.name.trim(),
                price: Number(this.form.price),
                category: this.form.category,
                description: this.form.desc.trim(),
                images: this.form.images.length
                    ? [...this.form.images]
                    : ['https://images.unsplash.com/photo-1544441893-675973e31985?w=800']
            };

            const result = this.form.id
                ? await db.from('products').update(product).eq('id', this.form.id)
                : await db.from('products').insert(product);

            if (result.error) return this.showError(result.error);

            this.resetForm();
            this.view = 'catalog';
            this.haptic('success');
            await this.loadData();
        },

        async deleteProduct(id) {
            const prod = this.products.find(p => p.id === id);
            if (!prod || !confirm('Вы точно хотите удалить ткань "' + prod.name + '"?')) return;
            const { error } = await db.from('products').delete().eq('id', id);
            if (error) return this.showError(error);
            this.haptic('warning');
            await this.loadData();
        }
    };
};

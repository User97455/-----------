/*
 * Общий каталог тканей и настройки хранятся в облачной базе данных Supabase 24/7.
 * База полностью автономна и работает независимо от компьютера.
 */
const SUPABASE_URL = 'https://kprtyjclotfyeldopfyc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2ZEud2o7XD3xuvrWqX7Zpg_bMyPIqDr';

/**
 * Автоматическое сжатие изображений на стороне браузера (Canvas).
 * Предотвращает переполнение базы и обеспечивает мгновенную загрузку на смартфонах и планшетах.
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
    const DEFAULT_PRODUCTS = [
        { name: 'Emerald Velvet', price: 2900, category: 'Велюр', desc: 'Густой шелковистый ворс, тест Мартиндейла 80.000 циклов. Премиальный глубокий изумрудный оттенок. Антикоготь и водоотталкивающая пропитка.', images: ['https://images.unsplash.com/photo-1616627561839-07437693233b?w=800', 'https://images.unsplash.com/photo-1544441893-675973e31985?w=800'] },
        { name: 'Terra Chenille', price: 2150, category: 'Шенилл', desc: 'Уютная фактура с легким благородным блеском. Повышенная износостойкость, высокая прочность волокон на разрыв.', images: ['https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800'] },
        { name: 'Nordic Rogozhka', price: 1850, category: 'Рогожка', desc: 'Скандинавское переплетение двойной нити. Отличная формоустойчивость, дышащая структура, стойкость к растяжению.', images: ['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800'] },
        { name: 'Barocco Jacquard', price: 3400, category: 'Жаккард', desc: 'Сложный рельефный узор высокой плотности. Идеально для классической мягкой мебели и роскошных изголовий.', images: ['https://images.unsplash.com/photo-1618221195710-dd6b41faa6?w=800'] }
    ];
    const configured = !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_ANON_KEY.startsWith('PASTE_');
    const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

    return {
        view: 'catalog',
        adminTab: 'products',
        isAdmin: false,
        activeCat: 'Все',
        isLoading: true,
        isCompressing: false,

        categories: [],
        products: [],
        currentBg: DEFAULT_BG,

        // Поля ввода в админке
        newCategoryName: '',
        imageUrlInput: '',
        bgInputUrl: '',
        form: { id: null, name: '', price: '', category: '', desc: '', images: [] },

        // Состояние модального окна просмотра (Quick View)
        modalProduct: null,
        modalImgIdx: 0,

        // Состояние свайпа для карточек
        touchCard: { startX: 0, startY: 0, time: 0 },
        // Состояние свайпа для модального окна
        touchModal: { startX: 0, startY: 0, time: 0 },

        async init() {
            if (!configured) {
                alert('Каталог ещё не подключён к Supabase. Проверьте настройки подключения в app.js.');
                this.isLoading = false;
                return;
            }
            await this.refreshAdminState();
            await this.loadData();
        },

        async loadData() {
            this.isLoading = true;
            try {
                // 1. Загрузка категорий и настроек (быстрые запросы < 1 КБ)
                const [categoriesResult, settingsResult] = await Promise.all([
                    db.from('categories').select('name').order('position'),
                    db.from('site_settings').select('value').eq('key', 'background_image').maybeSingle()
                ]);

                if (categoriesResult.data) {
                    this.categories = categoriesResult.data.map(item => item.name);
                }
                this.currentBg = settingsResult.data?.value || DEFAULT_BG;
                this.bgInputUrl = this.currentBg;
                if (!this.form.category && this.categories.length) {
                    this.form.category = this.categories[0];
                }

                // 2. Порционная загрузка товаров (порциями по 3 товара)
                // Это предотвращает PostgreSQL ошибку "canceling statement due to statement timeout"
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
                const { data: { session } } = await db.auth.getSession();
                if (!session) { this.isAdmin = false; return; }
                const { data, error } = await db.rpc('is_admin');
                this.isAdmin = !error && data === true;
                if (!this.isAdmin) await db.auth.signOut();
            } catch (e) {
                this.isAdmin = false;
            }
        },

        async login() {
            const email = prompt('E-mail администратора:');
            if (!email) return;
            const password = prompt('Пароль администратора:');
            if (password === null) return;
            const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
            if (error) return this.showError(error);
            await this.refreshAdminState();
            if (this.isAdmin) this.view = 'admin';
            else alert('У этой учётной записи нет прав администратора.');
        },

        async logout() {
            await db.auth.signOut();
            this.isAdmin = false;
            this.view = 'catalog';
        },

        showError(error) {
            console.error('Ошибка базы данных:', error);
            const msg = error?.message || '';
            if (msg.includes('statement timeout')) {
                console.warn('PostgreSQL statement timeout предотвращён, данные подгружаются порциями.');
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

        // ==================== СВАЙП И ЛИСТАНИЕ ФОТО В КАРТОЧКАХ ====================
        nextImage(p) {
            if (!p.images || p.images.length <= 1) return;
            p.activeImgIdx = ((p.activeImgIdx || 0) + 1) % p.images.length;
        },

        prevImage(p) {
            if (!p.images || p.images.length <= 1) return;
            p.activeImgIdx = ((p.activeImgIdx || 0) - 1 + p.images.length) % p.images.length;
        },

        setImage(p, idx) {
            if (!p.images || !p.images[idx]) return;
            p.activeImgIdx = idx;
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

            // Если горизонтальное перемещение больше вертикального и больше 35px — это свайп
            if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY) * 1.2 && elapsed < 800) {
                if (diffX < 0) {
                    this.nextImage(p);
                } else {
                    this.prevImage(p);
                }
            }
        },

        // ==================== МОДАЛЬНОЕ ОКНО ПРОСМОТРА И СВАЙПА ====================
        openQuickView(product, initialImgIdx = 0) {
            this.modalProduct = product;
            this.modalImgIdx = initialImgIdx || product.activeImgIdx || 0;
            document.body.style.overflow = 'hidden';
        },

        closeQuickView() {
            this.modalProduct = null;
            document.body.style.overflow = '';
        },

        nextModalImage() {
            if (!this.modalProduct || !this.modalProduct.images?.length) return;
            this.modalImgIdx = (this.modalImgIdx + 1) % this.modalProduct.images.length;
        },

        prevModalImage() {
            if (!this.modalProduct || !this.modalProduct.images?.length) return;
            this.modalImgIdx = (this.modalImgIdx - 1 + this.modalProduct.images.length) % this.modalProduct.images.length;
        },

        nextModalProduct() {
            if (!this.modalProduct) return;
            const list = this.filteredProducts;
            if (!list.length) return;
            const currentIdx = list.findIndex(p => p.id === this.modalProduct.id);
            const nextIdx = (currentIdx + 1) % list.length;
            this.modalProduct = list[nextIdx];
            this.modalImgIdx = 0;
        },

        prevModalProduct() {
            if (!this.modalProduct) return;
            const list = this.filteredProducts;
            if (!list.length) return;
            const currentIdx = list.findIndex(p => p.id === this.modalProduct.id);
            const prevIdx = (currentIdx - 1 + list.length) % list.length;
            this.modalProduct = list[prevIdx];
            this.modalImgIdx = 0;
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
                    // Свайп влево: следующее фото, а если фото одно — следующая ткань
                    if (this.modalProduct?.images && this.modalProduct.images.length > 1) {
                        this.nextModalImage();
                    } else {
                        this.nextModalProduct();
                    }
                } else {
                    // Свайп вправо: предыдущее фото, а если фото одно — предыдущая ткань
                    if (this.modalProduct?.images && this.modalProduct.images.length > 1) {
                        this.prevModalImage();
                    } else {
                        this.prevModalProduct();
                    }
                }
            }
        },

        // ==================== УПРАВЛЕНИЕ ФОНОМ ====================
        async saveBackground(value) {
            const { error } = await db.from('site_settings').upsert({ key: 'background_image', value });
            if (error) return this.showError(error);
            this.currentBg = value;
            this.bgInputUrl = value;
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
            await this.loadData();
        },

        // ==================== УПРАВЛЕНИЕ ТОВАРАМИ ====================
        openCreateProductModal(prefCat) {
            this.resetForm();
            if (prefCat && this.categories.includes(prefCat)) this.form.category = prefCat;
            this.view = 'admin';
            this.adminTab = 'products';
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
            await this.loadData();
        },

        async deleteProduct(id) {
            const prod = this.products.find(p => p.id === id);
            if (!prod || !confirm('Вы точно хотите удалить ткань "' + prod.name + '"?')) return;
            const { error } = await db.from('products').delete().eq('id', id);
            if (error) return this.showError(error);
            await this.loadData();
        }
    };
};

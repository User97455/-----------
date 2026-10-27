/*
 * Общий каталог хранится в Supabase, а не в браузере посетителя.
 * Вставьте данные своего проекта из Supabase: Project Settings → API.
 * Anon key можно использовать в клиентском коде; service_role key сюда не добавляйте.
 */
const SUPABASE_URL = 'https://kprtyjclotfyeldopfyc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2ZEud2o7XD3xuvrWqX7Zpg_bMyPIqDr';

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
        view: 'catalog', adminTab: 'products', isAdmin: false, activeCat: 'Все',
        categories: [], products: [], currentBg: DEFAULT_BG,
        newCategoryName: '', imageUrlInput: '', bgInputUrl: '',
        form: { id: null, name: '', price: '', category: '', desc: '', images: [] },

        async init() {
            if (!configured) {
                alert('Каталог ещё не подключён к Supabase. Укажите URL и anon key в файле app.js и выполните supabase-setup.sql.');
                return;
            }
            await this.refreshAdminState();
            await this.loadData();
        },

        async loadData() {
            const [categoriesResult, productsResult, settingsResult] = await Promise.all([
                db.from('categories').select('name').order('position'),
                db.from('products').select('*').order('created_at', { ascending: false }),
                db.from('site_settings').select('value').eq('key', 'background_image').maybeSingle()
            ]);
            const error = categoriesResult.error || productsResult.error || settingsResult.error;
            if (error) return this.showError(error);
            this.categories = categoriesResult.data.map(item => item.name);
            this.products = productsResult.data.map(item => ({ ...item, desc: item.description, images: item.images || [] }));
            this.currentBg = settingsResult.data?.value || DEFAULT_BG;
            this.bgInputUrl = this.currentBg;
            if (!this.form.category && this.categories.length) this.form.category = this.categories[0];
        },

        async refreshAdminState() {
            const { data: { session } } = await db.auth.getSession();
            if (!session) { this.isAdmin = false; return; }
            const { data, error } = await db.rpc('is_admin');
            this.isAdmin = !error && data === true;
            if (!this.isAdmin) await db.auth.signOut();
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

        async logout() { await db.auth.signOut(); this.isAdmin = false; this.view = 'catalog'; },
        showError(error) { console.error(error); alert('Не удалось сохранить данные: ' + (error.message || 'проверьте подключение к базе.')); },
        countByCategory(cat) { return this.products.filter(p => p.category === cat).length; },
        get filteredProducts() { return this.activeCat === 'Все' ? this.products : this.products.filter(p => p.category === this.activeCat); },
        formatPrice(price) { return Number(price || 0).toLocaleString('ru-RU'); },

        async saveBackground(value) {
            const { error } = await db.from('site_settings').upsert({ key: 'background_image', value });
            if (error) return this.showError(error);
            this.currentBg = value; this.bgInputUrl = value;
        },
        handleBgUpload(e) {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async event => { await this.saveBackground(event.target.result); alert('Фон сохранён для всех посетителей.'); };
            reader.readAsDataURL(file);
        },
        async applyBgUrl() { if (!this.bgInputUrl.trim()) return alert('Укажите URL или имя файла'); await this.saveBackground(this.bgInputUrl.trim()); },
        async resetBgToDefault() { if (confirm('Сбросить фон сайта к "background.jpg"?')) await this.saveBackground(DEFAULT_BG); },

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
            await this.saveBackground(DEFAULT_BG); await this.loadData(); alert('Данные сброшены к начальным.');
        },

        async addCategory() {
            const name = this.newCategoryName.trim();
            if (!name) return alert('Введите название категории');
            if (name.toLowerCase() === 'все') return alert('Имя "Все" зарезервировано для общего фильтра');
            if (this.categories.some(c => c.toLowerCase() === name.toLowerCase())) return alert('Такая категория уже существует!');
            const { error } = await db.from('categories').insert({ name, position: this.categories.length });
            if (error) return this.showError(error);
            this.newCategoryName = ''; await this.loadData();
        },
        async renameCategory(oldName) {
            const newName = prompt('Новое название для категории "' + oldName + '":', oldName);
            if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
            const trimmed = newName.trim();
            if (trimmed.toLowerCase() === 'все') return alert('Имя "Все" зарезервировано');
            if (this.categories.some(c => c.toLowerCase() === trimmed.toLowerCase() && c !== oldName)) return alert('Категория с таким именем уже существует!');
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

        openCreateProductModal(prefCat) { this.resetForm(); if (prefCat && this.categories.includes(prefCat)) this.form.category = prefCat; this.view = 'admin'; this.adminTab = 'products'; window.scrollTo({ top: 0, behavior: 'smooth' }); },
        editProduct(p) { this.form = { id: p.id, name: p.name, price: p.price, category: p.category, desc: p.desc, images: [...(p.images || [])] }; this.view = 'admin'; this.adminTab = 'products'; window.scrollTo({ top: 0, behavior: 'smooth' }); },
        resetForm() { this.form = { id: null, name: '', price: '', category: this.categories[0] || '', desc: '', images: [] }; this.imageUrlInput = ''; },
        handleFiles(e) { for (const file of (e.target.files || [])) { const reader = new FileReader(); reader.onload = event => this.form.images.push(event.target.result); reader.readAsDataURL(file); } },
        addImageByUrl() { const url = this.imageUrlInput.trim(); if (url) { this.form.images.push(url); this.imageUrlInput = ''; } },
        async saveProduct() {
            if (!this.form.name.trim()) return alert('Укажите название ткани!');
            if (!this.form.price || Number(this.form.price) <= 0) return alert('Укажите корректную цену!');
            if (!this.form.category) return alert('Выберите категорию ткани!');
            const product = { name: this.form.name.trim(), price: Number(this.form.price), category: this.form.category, description: this.form.desc.trim(), images: this.form.images.length ? [...this.form.images] : ['https://images.unsplash.com/photo-1544441893-675973e31985?w=800'] };
            const result = this.form.id ? await db.from('products').update(product).eq('id', this.form.id) : await db.from('products').insert(product);
            if (result.error) return this.showError(result.error);
            this.resetForm(); this.view = 'catalog'; await this.loadData();
        },
        async deleteProduct(id) { const prod = this.products.find(p => p.id === id); if (!prod || !confirm('Вы точно хотите удалить ткань "' + prod.name + '"?')) return; const { error } = await db.from('products').delete().eq('id', id); if (error) return this.showError(error); await this.loadData(); }
    };
};

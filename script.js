// Picking Pro 2.0 - Multi-Loja Avançado - JavaScript Principal
// SEPARATION BE MAKE 3.0

// Variáveis globais
let db = { lojas: [], metadata: { created: new Date().toISOString(), lastModified: new Date().toISOString() } };
let activeLojaIdx = null;
let activeItemIdx = null;

// Carregar dados ao abrir
window.onload = () => {
    loadFromStorage();
    setupKeyboardShortcuts();
    setupAutoBackup();
    render();
};

// Funções de Storage
function loadFromStorage() {
    const saved = localStorage.getItem('picking_data_v2');
    if (saved) {
        try {
            db = JSON.parse(saved);
            render();
            document.getElementById('inputSection').classList.add('hidden');
            updateStats();
            updateFilterOptions();
        } catch (e) {
            console.error('Erro ao carregar dados:', e);
            showNotification('Erro ao carregar dados salvos', 'error');
        }
    }
}

function saveToStorage() {
    db.metadata.lastModified = new Date().toISOString();
    localStorage.setItem('picking_data_v2', JSON.stringify(db));
}

// Função principal de iniciação
function iniciarNovaSeparacao() {
    const guiaInput = document.getElementById('guiaInput');
    if (!guiaInput) {
        showNotification('Erro: campo de dados não encontrado', 'error');
        return;
    }
    
    const text = guiaInput.value;
    if(!text) {
        showNotification('Cole os dados da guia primeiro', 'error');
        return;
    }

    const validation = validateInput(text);
    if (!validation.valid) {
        showValidationErrors(validation.errors);
        return;
    }

    const guias = text.split(/GUIA DE SEPARAÇÃO/i).filter(g => g.trim().length > 10);
    db.lojas = guias.map(guiaText => {
        const nomeLoja = guiaText.match(/(.*?)(?=CNPJ:)/)?.[1]?.trim() || "Loja";
        const cnpj = guiaText.match(/CNPJ:\s*([\d./-]+)/)?.[1] || "";
        const itens = [];
        // Regex para formato tabulado: Produto[TAB]Referência[TAB]Quantidade
        const itemRegex = /^(.*?)\t+([A-Z0-9]+)\t+(\d+)\s*$/gm;
        let match;
        
        console.log('Processando guia:', guiaText.substring(0, 200) + '...');
        
        while ((match = itemRegex.exec(guiaText)) !== null) {
            const nome = match[1].trim();
            const ref = match[2];
            const qtd = parseInt(match[3]);
            
            console.log('Match encontrado:', { nome, ref, qtd });
            
            // Ignorar linhas que não são produtos
            if (nome.includes('CNPJ:') || nome.includes('Pedido:') || nome.includes('Fornecedor:') || 
                nome.includes('Previsão:') || nome.includes('Produto') || nome.includes('Referência') || 
                nome.includes('Boxes') || nome.includes('Separado') || nome.includes('Data:') ||
                nome.includes('✓') || nome.includes('GUIA') || nome.length < 5 ||
                !ref.match(/^[A-Z0-9]+$/)) {
                console.log('Linha ignorada:', nome);
                continue;
            }
            
            console.log('Item válido adicionado:', { nome, ref, qtd });
            
            itens.push({
                id: generateId(),
                nome: nome.replace(/ProdutoReferênciaBoxes✓/i, '').trim(),
                ref: ref,
                total: qtd,
                coletado: 0,
                status: 'pending',
                lastModified: new Date().toISOString()
            });
        }
        return { 
            id: generateId(), 
            nome: nomeLoja, 
            cnpj, 
            itens, 
            open: true,
            stats: { total: itens.length, completed: 0, partial: 0, pending: itens.length }
        };
    });

    saveAndRender();
    document.getElementById('inputSection').classList.add('hidden');
    updateStats();
    updateFilterOptions();
    // Limpar campo após sucesso
    guiaInput.value = '';
    showNotification('Separação iniciada com sucesso!', 'success');
}

// Validação de input
function validateInput(text) {
    const errors = [];
    
    if (!text.includes('GUIA DE SEPARAÇÃO')) {
        errors.push('Texto não contém "GUIA DE SEPARAÇÃO"');
    }
    
    const guias = text.split(/GUIA DE SEPARAÇÃO/i).filter(g => g.trim().length > 10);
    if (guias.length === 0) {
        errors.push('Nenhuma guia válida encontrada');
    }
    
    guias.forEach((guia, idx) => {
        // Usar o mesmo regex e filtros da função de parsing
        const itemRegex = /^(.*?)\t+([A-Z0-9]+)\t+(\d+)\s*$/gm;
        let match;
        let validItems = 0;
        
        console.log(`Validando guia ${idx + 1}:`, guia.substring(0, 100) + '...');
        
        while ((match = itemRegex.exec(guia)) !== null) {
            const nome = match[1].trim();
            const ref = match[2];
            const qtd = match[3];
            
            console.log('Match encontrado:', { nome, ref, qtd });
            
            // Ignorar linhas que não são produtos (mesma lógica do parsing)
            if (nome.includes('CNPJ:') || nome.includes('Pedido:') || nome.includes('Fornecedor:') || 
                nome.includes('Previsão:') || nome.includes('Produto') || nome.includes('Referência') || 
                nome.includes('Boxes') || nome.includes('Separado') || nome.includes('Data:') ||
                nome.includes('✓') || nome.includes('GUIA') || nome.length < 5 ||
                !ref.match(/^[A-Z0-9]+$/)) {
                console.log('Linha ignorada:', nome);
                continue;
            }
            
            validItems++;
            console.log('Item válido:', { nome, ref, qtd });
        }
        
        if (validItems === 0) {
            errors.push(`Guia ${idx + 1}: Nenhum item válido encontrado`);
        } else {
            console.log(`Guia ${idx + 1}: ${validItems} itens válidos encontrados`);
        }
    });
    
    return { valid: errors.length === 0, errors };
}

function showValidationErrors(errors) {
    const errorDiv = document.getElementById('validationErrors');
    errorDiv.innerHTML = '<strong>Erros de validação:</strong><ul class="list-disc ml-4 mt-2">' + 
        errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 5000);
}

// Renderização principal
function render() {
    const container = document.getElementById('lojasContainer');
    container.innerHTML = '';

    let filteredLojas = getFilteredLojas();

    filteredLojas.forEach((loja, lIdx) => {
        const originalIdx = db.lojas.indexOf(loja);
        let itensHtml = '';
        
        loja.itens.forEach((item, iIdx) => {
            if (!shouldShowItem(item)) return;
            
            const statusClass = getStatusClass(item);
            const statusBadge = getStatusBadge(item);
            
            itensHtml += `
                <div class="product-card ${statusClass} bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 transition-all hover:shadow-md" onclick="openModal(${originalIdx}, ${iIdx})">
                    <div class="text-[10px] font-bold text-slate-400 w-4">${iIdx + 1}</div>
                    <div class="flex-1">
                        <div class="text-[10px] font-black text-blue-600">${item.ref}</div>
                        <div class="text-sm font-bold text-slate-800">${item.nome}</div>
                        ${statusBadge}
                    </div>
                    <div class="text-right">
                        <div class="text-xs text-slate-400">Qtd</div>
                        <div class="font-black">${item.coletado}/${item.total}</div>
                        <div class="text-xs text-gray-500">${Math.round((item.coletado/item.total)*100)}%</div>
                    </div>
                </div>
            `;
        });

        if (itensHtml) {
            container.innerHTML += `
                <div class="loja-group fade-in">
                    <div class="flex items-center justify-between bg-slate-800 text-white p-4 rounded-xl mb-2 cursor-pointer hover:bg-slate-700 transition-colors" onclick="toggleLoja(${originalIdx})">
                        <div>
                            <h2 class="font-bold text-sm">${loja.nome}</h2>
                            <p class="text-[10px] opacity-70">${loja.cnpj}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs bg-green-600 px-2 py-1 rounded">${loja.stats?.completed || 0}/${loja.stats?.total || 0}</span>
                            <span class="text-xs">${loja.open ? '▼' : '▲'}</span>
                        </div>
                    </div>
                    <div class="${loja.open ? 'grid' : 'hidden'} gap-2 mb-6 slide-down">
                        ${itensHtml}
                    </div>
                </div>
            `;
        }
    });

    if (container.innerHTML === '') {
        container.innerHTML = '<div class="text-center py-10 text-gray-500">Nenhum item encontrado com os filtros atuais</div>';
    }
}

// Funções de filtro
function getFilteredLojas() {
    let lojas = [...db.lojas];
    const statusFilter = document.getElementById('filterStatus').value;
    const lojaFilter = document.getElementById('filterLoja').value;
    
    if (lojaFilter) {
        lojas = lojas.filter(l => l.id === lojaFilter);
    }
    
    return lojas;
}

function shouldShowItem(item) {
    const statusFilter = document.getElementById('filterStatus').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    if (searchTerm && !item.nome.toLowerCase().includes(searchTerm) && !item.ref.toLowerCase().includes(searchTerm)) {
        return false;
    }
    
    if (statusFilter) {
        if (statusFilter === 'pending' && item.coletado > 0) return false;
        if (statusFilter === 'partial' && (item.coletado === 0 || item.coletado >= item.total)) return false;
        if (statusFilter === 'completed' && item.coletado < item.total) return false;
    }
    
    return true;
}

// Funções de status
function getStatusClass(item) {
    if (item.coletado === 0) return '';
    if (item.coletado >= item.total) return 'status-concluido';
    return 'status-parcial';
}

function getStatusBadge(item) {
    if (item.coletado > 0 && item.coletado < item.total) {
        return '<span class="text-[10px] bg-yellow-400 px-1 rounded font-bold">PENDENTE</span>';
    }
    if (item.coletado >= item.total) {
        return '<span class="text-[10px] bg-green-500 text-white px-1 rounded font-bold">CONCLUÍDO</span>';
    }
    return '';
}

// Funções de interface
function toggleLoja(idx) {
    db.lojas[idx].open = !db.lojas[idx].open;
    saveAndRender();
}

function openModal(lIdx, iIdx) {
    activeLojaIdx = lIdx;
    activeItemIdx = iIdx;
    const item = db.lojas[lIdx].itens[iIdx];
    
    // Verificar se elementos existem
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalRef = document.getElementById('modalRef');
    const targetQty = document.getElementById('targetQty');
    const currentQty = document.getElementById('currentQty');
    const inputQty = document.getElementById('inputQty');
    const errorMsg = document.getElementById('errorMsg');
    
    if (!modal || !modalTitle || !modalRef || !targetQty || !currentQty || !inputQty || !errorMsg) {
        console.error('Elementos do modal não encontrados');
        showNotification('Erro ao abrir modal', 'error');
        return;
    }
    
    modalTitle.innerText = item.nome;
    modalRef.innerText = item.ref;
    targetQty.innerText = item.total;
    currentQty.innerText = item.coletado;
    inputQty.value = '';
    errorMsg.classList.add('hidden');
    modal.classList.remove('hidden');
    
    setTimeout(() => {
        inputQty.focus();
    }, 100);
}

// Teclado numérico
function appendNumber(num) {
    const input = document.getElementById('inputQty');
    const current = input.value || '0';
    
    if (current === '0') {
        input.value = num;
    } else {
        input.value = current + num;
    }
    
    checkQuantity();
}

function clearInput() {
    document.getElementById('inputQty').value = '';
    document.getElementById('errorMsg').classList.add('hidden');
}

function subtractQty() {
    const input = document.getElementById('inputQty');
    const current = parseInt(input.value) || 0;
    if (current > 0) {
        input.value = current - 1;
    }
    checkQuantity();
}

function checkQuantity() {
    const val = parseInt(document.getElementById('inputQty').value) || 0;
    const item = db.lojas[activeLojaIdx].itens[activeItemIdx];
    const errorMsg = document.getElementById('errorMsg');
    
    if (item.coletado + val > item.total) {
        errorMsg.classList.remove('hidden');
        return false;
    } else {
        errorMsg.classList.add('hidden');
        return true;
    }
}

function saveQty() {
    const val = parseInt(document.getElementById('inputQty').value) || 0;
    const item = db.lojas[activeLojaIdx].itens[activeItemIdx];
    
    if (!checkQuantity()) return;
    
    item.coletado += val;
    item.lastModified = new Date().toISOString();
    
    updateLojaStats(activeLojaIdx);
    closeModal();
    saveAndRender();
    updateStats();
    
    showNotification(`Adicionado ${val} unidades ao item ${item.ref}`, 'success');
}

// Função para zerar quantidade do item
function resetItemQty() {
    const item = db.lojas[activeLojaIdx].itens[activeItemIdx];
    
    // Abrir modal de confirmação com mensagem personalizada
    const message = `Tem certeza que deseja zerar a quantidade do item ${item.ref}? Isso irá remover ${item.coletado} unidades já separadas.`;
    document.getElementById('resetItemMessage').textContent = message;
    document.getElementById('resetItemModal').classList.remove('hidden');
}

// Funções do modal de zerar item
function closeResetItemModal() {
    document.getElementById('resetItemModal').classList.add('hidden');
}

function confirmResetItem() {
    const item = db.lojas[activeLojaIdx].itens[activeItemIdx];
    
    item.coletado = 0;
    item.lastModified = new Date().toISOString();
    
    updateLojaStats(activeLojaIdx);
    closeModal();
    closeResetItemModal();
    saveAndRender();
    updateStats();
    
    showNotification(`Quantidade do item ${item.ref} zerada com sucesso!`, 'success');
}

function updateLojaStats(lojaIdx) {
    const loja = db.lojas[lojaIdx];
    loja.stats = {
        total: loja.itens.length,
        completed: loja.itens.filter(i => i.coletado >= i.total).length,
        partial: loja.itens.filter(i => i.coletado > 0 && i.coletado < i.total).length,
        pending: loja.itens.filter(i => i.coletado === 0).length
    };
}

function saveAndRender() {
    saveToStorage();
    render();
}

function closeModal() { 
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.add('hidden'); 
    }
}

// Cards colapsáveis
function toggleFiltersCard() {
    const content = document.getElementById('filtersCardContent');
    const icon = document.getElementById('filtersCardIcon');
    
    content.classList.toggle('hidden');
    icon.textContent = icon.textContent === '▼' ? '▲' : '▼';
}

function toggleResetCard() {
    const content = document.getElementById('resetCardContent');
    const icon = document.getElementById('resetCardIcon');
    
    content.classList.toggle('hidden');
    icon.textContent = icon.textContent === '▼' ? '▲' : '▼';
}

// Modal de confirmação
function showConfirmModal() {
    document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
}

function confirmReset() {
    localStorage.removeItem('picking_data_v2');
    location.reload();
}

function resetTudo() {
    showConfirmModal();
}

// Import/Export
function exportData() {
    const blob = new Blob([JSON.stringify(db, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `separacao_${new Date().toLocaleDateString('pt-BR')}.json`;
    a.click();
    showNotification('Dados exportados com sucesso!', 'success');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Verificar se é PDF (não permitir)
        if (file.type === 'application/pdf') {
            showNotification('Use o visualizador de PDF acima para ver PDFs. Importar é apenas para arquivos JSON.', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const imported = JSON.parse(event.target.result);
                if (imported.lojas && Array.isArray(imported.lojas)) {
                    db = imported;
                    saveAndRender();
                    updateStats();
                    updateFilterOptions();
                    showNotification('Dados importados com sucesso!', 'success');
                } else {
                    throw new Error('Formato inválido');
                }
            } catch (error) {
                showNotification('Erro ao importar arquivo: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Relatórios
function showReport() {
    const modal = document.getElementById('reportModal');
    const content = document.getElementById('reportContent');
    
    let totalItens = 0, totalSeparado = 0, totalPendente = 0;
    let lojasHtml = '';
    
    db.lojas.forEach(loja => {
        let lojaTotal = 0, lojaSeparado = 0;
        loja.itens.forEach(item => {
            totalItens++;
            lojaTotal++;
            totalSeparado += item.coletado;
            lojaSeparado += item.coletado;
            if (item.coletado < item.total) {
                totalPendente += (item.total - item.coletado);
            }
        });
        
        const percent = lojaTotal > 0 ? Math.round((lojaSeparado / lojaTotal) * 100) : 0;
        lojasHtml += `
            <div class="border rounded-lg p-3">
                <h4 class="font-bold">${loja.nome}</h4>
                <p class="text-sm text-gray-600">Progresso: ${percent}% (${lojaSeparado}/${lojaTotal})</p>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div class="bg-blue-600 h-2 rounded-full" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    });
    
    const geralPercent = totalItens > 0 ? Math.round((totalSeparado / totalItens) * 100) : 0;
    
    content.innerHTML = `
        <div class="bg-blue-50 p-4 rounded-xl mb-4">
            <h4 class="font-bold text-lg mb-2">Resumo Geral</h4>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-sm text-gray-600">Progresso Total</p>
                    <p class="text-2xl font-bold">${geralPercent}%</p>
                </div>
                <div>
                    <p class="text-sm text-gray-600">Itens Pendentes</p>
                    <p class="text-2xl font-bold text-red-600">${totalPendente}</p>
                </div>
            </div>
        </div>
        
        <div>
            <h4 class="font-bold mb-2">Progresso por Loja</h4>
            <div class="space-y-2">
                ${lojasHtml}
            </div>
        </div>
        
        <div class="mt-4 text-xs text-gray-500">
            <p>Criado: ${new Date(db.metadata.created).toLocaleString('pt-BR')}</p>
            <p>Última modificação: ${new Date(db.metadata.lastModified).toLocaleString('pt-BR')}</p>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

function closeReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
}

// Estatísticas
function updateStats() {
    if (db.lojas.length === 0) return;
    
    let total = 0, pending = 0, partial = 0, completed = 0;
    
    db.lojas.forEach(loja => {
        loja.itens.forEach(item => {
            total++;
            if (item.coletado === 0) pending++;
            else if (item.coletado >= item.total) completed++;
            else partial++;
        });
    });
    
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statPartial').textContent = partial;
    document.getElementById('statCompleted').textContent = completed;
    
    document.getElementById('statsBar').classList.remove('hidden');
}

function updateFilterOptions() {
    const lojaSelect = document.getElementById('filterLoja');
    lojaSelect.innerHTML = '<option value="">Todas Lojas</option>';
    
    db.lojas.forEach(loja => {
        lojaSelect.innerHTML += `<option value="${loja.id}">${loja.nome}</option>`;
    });
}

// Filtros
function applyFilters() {
    render();
}

// Utilitários
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-xl text-white font-bold z-50 fade-in ${
        type === 'success' ? 'bg-green-600' : 
        type === 'error' ? 'bg-red-600' : 'bg-blue-600'
    }`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Atalhos de teclado
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'r':
                    e.preventDefault();
                    showReport();
                    break;
                case 'e':
                    e.preventDefault();
                    exportData();
                    break;
                case 'i':
                    e.preventDefault();
                    importData();
                    break;
            }
        } else if (e.key === 'Escape') {
            if (!document.getElementById('modal').classList.contains('hidden')) {
                closeModal();
            }
            if (!document.getElementById('reportModal').classList.contains('hidden')) {
                closeReportModal();
            }
            if (!document.getElementById('confirmModal').classList.contains('hidden')) {
                closeConfirmModal();
            }
        }
    });
}

// Auto backup
function setupAutoBackup() {
    setInterval(() => {
        if (db.lojas.length > 0) {
            saveToStorage();
            console.log('Auto backup realizado');
        }
    }, 30000); // A cada 30 segundos
}

// Exportar PDF (nova funcionalidade)
function exportPDF() {
    // Carregar jsPDF dinamicamente
    if (typeof window.jspdf === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            generatePDF();
        };
        document.head.appendChild(script);
    } else {
        generatePDF();
    }
}

function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Cabeçalho simples
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('Relatorio de Separacao', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 105, 30, { align: 'center' });
    
    let yPosition = 50;
    
    // Resumo geral simples
    let totalItens = 0, totalSeparado = 0, concluidos = 0, parciais = 0, pendentes = 0;
    
    db.lojas.forEach(loja => {
        loja.itens.forEach(item => {
            totalItens++;
            totalSeparado += item.coletado;
            if (item.coletado >= item.total) concluidos++;
            else if (item.coletado > 0) parciais++;
            else pendentes++;
        });
    });
    
    const geralPercent = totalItens > 0 ? Math.round((totalSeparado / totalItens) * 100) : 0;
    
    // Box de resumo simples
    doc.setFillColor(240, 240, 240);
    doc.rect(20, yPosition - 10, 170, 30, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(20, yPosition - 10, 170, 30);
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Progresso Total: ${geralPercent}% | Concluidos: ${concluidos} | Parciais: ${parciais} | Pendentes: ${pendentes}`, 105, yPosition + 5, { align: 'center' });
    
    yPosition += 40;
    
    // Detalhes por loja
    db.lojas.forEach((loja, index) => {
        if (yPosition > 240) {
            doc.addPage();
            yPosition = 20;
        }
        
        // Cabeçalho da loja
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(`${index + 1}. ${loja.nome}`, 20, yPosition);
        
        if (loja.cnpj) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`CNPJ: ${loja.cnpj}`, 20, yPosition + 7);
        }
        
        yPosition += 20;
        
        // Itens da loja
        loja.itens.forEach(item => {
            if (yPosition > 270) {
                doc.addPage();
                yPosition = 20;
            }
            
            const status = item.coletado >= item.total ? 'CONCLUIDO' : 
                          item.coletado > 0 ? 'PARCIAL' : 'PENDENTE';
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`  ${item.ref} - ${item.nome.substring(0, 50)}${item.nome.length > 50 ? '...' : ''}`, 20, yPosition);
            doc.text(`${item.coletado}/${item.total} - ${status}`, 150, yPosition);
            
            yPosition += 8;
        });
        
        yPosition += 15;
    });
    
    // Salvar PDF
    const fileName = `relatorio_separacao_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
    showNotification('PDF gerado com sucesso!', 'success');
}

// Funções do modal de ações
function openActionsModal() {
    document.getElementById('actionsModal').classList.remove('hidden');
}

function closeActionsModal() {
    document.getElementById('actionsModal').classList.add('hidden');
}

// Funções do Visualizador de PDF - REMOVIDAS
// PDF viewer foi removido conforme solicitação do usuário

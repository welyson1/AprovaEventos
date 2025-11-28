// Initialize Lucide
lucide.createIcons();

// Global state
let currentEvent = null;
let currentDocId = null;

// Icon mapping
const iconMap = {
    flame: 'flame',
    shield: 'shield',
    'traffic-cone': 'cone',
    leaf: 'leaf',
    music: 'music',
    baby: 'baby',
    receipt: 'receipt'
};

// Load event data
function loadEventData() {
    const db = JSON.parse(localStorage.getItem('aprovaEventos_db'));
    
    if (!db || !db.user) {
        window.location.href = 'login.html';
        return;
    }
    
    if (!db.currentEvent) {
        window.location.href = 'nova-solicitacao.html';
        return;
    }
    
    currentEvent = db.currentEvent;
    // Ensure each document has a history array
    currentEvent.documentos.forEach(doc => {
        if (!doc.history) doc.history = [];
    });

    // Simulate one document reprovação -> reenvio -> aprovação (only once)
    const firstUpload = currentEvent.documentos.find(d => d.tipo === 'upload');
    if (firstUpload && (!firstUpload.history || firstUpload.history.length === 0)) {
        const now = new Date();
        firstUpload.history = [
            { action: 'enviado', by: db.user.nome, comment: 'Documento enviado para análise', date: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString() },
            { action: 'reprovado', by: 'Analista', comment: 'Assinatura ausente - favor reenviar com assinatura digital', date: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString() },
            { action: 'reenviado', by: db.user.nome, comment: 'Reenvio com assinatura digital', date: new Date(now.getTime() - 1000 * 60 * 60 * 6).toISOString() },
            { action: 'aprovado', by: 'Analista', comment: 'Documento conferido e aprovado', date: now.toISOString() }
        ];
        firstUpload.status = 'aprovado';
    }
    
    // Update UI
    document.getElementById('eventName').textContent = currentEvent.nome;
    document.getElementById('summaryEventName').textContent = currentEvent.nome;
    document.getElementById('summaryLocal').textContent = currentEvent.local.split('(')[0].trim();
    document.getElementById('summaryData').textContent = formatDate(currentEvent.data);
    document.getElementById('summaryPublico').textContent = currentEvent.publico + ' pessoas';
    document.getElementById('userAvatar').textContent = db.user.avatar;
    
    // Calculate and update progress
    updateProgress();
    
    // Render status badge
    renderStatusBadge();
    
    // Render documents
    renderDocuments();
    
    // Render timeline
    renderTimeline();
    
    // Update taxes
    updateTaxes();
    
    // Show fast track if approved
    if (currentEvent.status === 'aprovado_automatico') {
        document.getElementById('fastTrackBanner').classList.remove('hidden');
        celebrateApproval();
    }
}

// Helper: add an entry to document history
function addDocHistory(doc, action, by, comment) {
    if (!doc.history) doc.history = [];
    doc.history.push({ action, by, comment, date: new Date().toISOString() });
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function updateProgress() {
    const docs = currentEvent.documentos;
    const completed = docs.filter(d => d.status === 'aprovado' || d.status === 'pago').length;
    const total = docs.length;
    const allApproved = completed === total && total > 0;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    // If auto-approved, show 100%
    const displayProgress = currentEvent.status === 'aprovado_automatico' || allApproved ? 100 : progress;

    document.getElementById('progressPercent').textContent = displayProgress + '%';
    document.getElementById('progressBar').style.width = displayProgress + '%';
    document.getElementById('docsCount').textContent = `${completed} de ${total} concluídos`;

    // Atualiza status do evento para Em Análise ou Aprovado
    if (allApproved) {
        currentEvent.status = 'aprovado';
    } else if (completed > 0) {
        currentEvent.status = 'em_analise';
    } else {
        currentEvent.status = 'pendente';
    }

    // Exibe botão de resumo/alvará se todos aprovados
    const resumoBtnId = 'btnResumoAlvara';
    let resumoBtn = document.getElementById(resumoBtnId);
    if (allApproved) {
        if (!resumoBtn) {
            resumoBtn = document.createElement('button');
            resumoBtn.id = resumoBtnId;
            resumoBtn.className = 'mt-4 w-full py-3 bg-green-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2';
            resumoBtn.innerHTML = '<i data-lucide="award" class="w-5 h-5"></i> Resumo dos documentos e Alvará';
            resumoBtn.onclick = function() { openResumoAlvaraModal(); };
            document.querySelector('.bg-gradient-to-r').appendChild(resumoBtn);
            lucide.createIcons();
        }
    } else {
        if (resumoBtn) resumoBtn.remove();
    }

    // Update in storage
    currentEvent.progresso = displayProgress;
    saveEventData();
// Modal de resumo/alvará
function openResumoAlvaraModal() {
    // Cria modal se não existir
    let modal = document.getElementById('resumoAlvaraModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'resumoAlvaraModal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center';
        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeResumoAlvaraModal()"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
                <h3 class="font-bold text-lg text-slate-800 mb-2 flex items-center gap-2"><i data-lucide="award" class="w-6 h-6 text-green-600"></i> Resumo dos Documentos e Alvará</h3>
                <div id="resumoAlvaraContent" class="mb-4"></div>
                <div class="flex gap-2 mt-4">
                    <button onclick="printAlvaraPDF()" class="flex-1 py-3 bg-govbr-primary text-white rounded-xl">Gerar PDF</button>
                    <button onclick="enviarAlvaraEmail()" class="flex-1 py-3 bg-blue-50 text-blue-700 rounded-xl">Enviar por Email</button>
                    <button onclick="closeResumoAlvaraModal()" class="flex-1 py-3 bg-slate-50 rounded-xl">Fechar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    // Preenche conteúdo
    const approved = currentEvent.documentos.filter(d => d.status === 'aprovado' || d.status === 'pago');
    // Histórico do alvará
    // Histórico do alvará dinâmico
    let alvaraHistory = [];
    alvaraHistory.push({
        action: 'solicitado',
        by: currentEvent.solicitante || 'Solicitante',
        date: currentEvent.data,
        comment: 'Solicitação criada'
    });
    if (currentEvent.status === 'em_analise' || currentEvent.status === 'aprovado') {
        alvaraHistory.push({
            action: 'em_analise',
            by: 'Sistema',
            date: new Date().toISOString(),
            comment: 'Análise documental'
        });
    }
    if (currentEvent.status === 'aprovado') {
        alvaraHistory.push({
            action: 'aprovado',
            by: 'Prefeitura',
            date: new Date().toISOString(),
            comment: 'Emissão do alvará'
        });
    }
    document.getElementById('resumoAlvaraContent').innerHTML = `
        <div class="p-4 bg-slate-50 border rounded mb-4">
            <p class="text-sm text-slate-700">Todos os documentos foram aprovados. O alvará está disponível para geração em PDF ou envio por email.</p>
        </div>
        <h4 class="font-semibold mb-2">Documentos aprovados</h4>
        <ul class="mb-2 space-y-2 text-sm">
            ${approved.map(d => `<li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-green-600"></i>${d.documento} <span class="text-slate-400 text-xs ml-2">(${d.orgao})</span></li>`).join('')}
        </ul>
        <h4 class="font-semibold mt-4 mb-2">Histórico do Alvará</h4>
        <ul class="mb-2 space-y-2 text-sm">
            ${alvaraHistory.map(h => {
                let color = h.action === 'aprovado' ? 'text-green-700' : h.action === 'em_analise' ? 'text-amber-700' : 'text-slate-700';
                return `<li class="flex items-center gap-2"><i data-lucide="clock" class="w-4 h-4 ${color}"></i><span class="${color}">${h.action.toUpperCase()}</span> - ${h.comment} <span class="text-slate-400 text-xs ml-2">${new Date(h.date).toLocaleString('pt-BR')}</span></li>`;
            }).join('')}
        </ul>
        <h4 class="font-semibold mt-4 mb-2">Dados do Evento</h4>
        <div class="text-sm text-slate-700 mb-2">Evento: <strong>${currentEvent.nome}</strong></div>
        <div class="text-sm text-slate-700 mb-2">Local: <strong>${currentEvent.local}</strong></div>
        <div class="text-sm text-slate-700 mb-2">Data: <strong>${formatDate(currentEvent.data)}</strong></div>
        <div class="text-sm text-slate-700 mb-2">Público estimado: <strong>${currentEvent.publico}</strong></div>
    `;
    lucide.createIcons();
    modal.style.display = 'flex';
}

function closeResumoAlvaraModal() {
    const modal = document.getElementById('resumoAlvaraModal');
    if (modal) modal.style.display = 'none';
}

function printAlvaraPDF() {
    // Simples: usa print do navegador
    const content = document.getElementById('resumoAlvaraContent').innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Alvará PDF</title></head><body>${content}</body></html>`);
    w.document.close();
    w.print();
}

function enviarAlvaraEmail() {
    showToast('Alvará enviado por email (simulação)', 'success');
    closeResumoAlvaraModal();
}
}

function renderStatusBadge() {
    const badge = document.getElementById('statusBadge');
    const status = currentEvent.status;
    
    const statusConfig = {
        'aprovado_automatico': {
            label: 'Aprovado Automaticamente',
            icon: 'zap',
            class: 'bg-white/20 text-white'
        },
        'em_analise': {
            label: 'Em Análise',
            icon: 'clock',
            class: 'bg-amber-400/20 text-amber-100'
        },
        'aprovado': {
            label: 'Aprovado',
            icon: 'check-circle',
            class: 'bg-green-400/20 text-green-100'
        },
        'pendente': {
            label: 'Pendente',
            icon: 'alert-circle',
            class: 'bg-red-400/20 text-red-100'
        }
    };
    
    const config = statusConfig[status] || statusConfig['pendente'];
    
    badge.innerHTML = `
        <span class="flex items-center gap-2 px-4 py-2 ${config.class} rounded-full font-medium">
            <i data-lucide="${config.icon}" class="w-4 h-4"></i>
            ${config.label}
        </span>
    `;
    lucide.createIcons();
}

function renderDocuments() {
    const container = document.getElementById('documentsList');
    container.innerHTML = '';
    
    currentEvent.documentos.forEach((doc, index) => {
        const statusConfig = {
            'pendente': {
                label: 'Pendente',
                bgColor: 'bg-slate-100',
                textColor: 'text-slate-600',
                borderColor: 'border-slate-200',
                icon: 'circle'
            },
            'em_analise': {
                label: 'Em Análise',
                bgColor: 'bg-amber-50',
                textColor: 'text-amber-600',
                borderColor: 'border-amber-200',
                icon: 'clock'
            },
            'aprovado': {
                label: 'Aprovado',
                bgColor: 'bg-green-50',
                textColor: 'text-green-600',
                borderColor: 'border-green-200',
                icon: 'check-circle'
            },
            'autodeclaracao': {
                label: 'Autodeclaração',
                bgColor: 'bg-blue-50',
                textColor: 'text-blue-600',
                borderColor: 'border-blue-200',
                icon: 'file-check'
            },
            'pago': {
                label: 'Pago',
                bgColor: 'bg-green-50',
                textColor: 'text-green-600',
                borderColor: 'border-green-200',
                icon: 'check-circle'
            },
            'comentario': {
                label: 'Requer Atenção',
                bgColor: 'bg-red-50',
                textColor: 'text-red-600',
                borderColor: 'border-red-200',
                icon: 'alert-triangle'
            }
        };
        
        const config = statusConfig[doc.status] || statusConfig['pendente'];
        const isCompleted = doc.status === 'aprovado' || doc.status === 'pago';
        
        const card = document.createElement('div');
        card.className = `bg-white rounded-xl border ${config.borderColor} p-4 card-hover fade-in`;
        card.style.animationDelay = `${index * 0.1}s`;
        
        card.innerHTML = `
            <div class="flex items-start gap-4">
                <div class="w-12 h-12 ${config.bgColor} rounded-xl flex items-center justify-center flex-shrink-0">
                    <i data-lucide="${doc.icon || 'file-text'}" class="w-6 h-6 ${config.textColor}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <h4 class="font-semibold text-slate-800">${doc.documento}</h4>
                            <p class="text-sm text-slate-500">${doc.orgao}</p>
                        </div>
                        <span class="flex items-center gap-1 px-2 py-1 ${config.bgColor} ${config.textColor} rounded-full text-xs font-medium whitespace-nowrap">
                            <i data-lucide="${config.icon}" class="w-3 h-3"></i>
                            ${config.label}
                        </span>
                    </div>
                    ${doc.valor ? `<p class="text-sm font-semibold text-govbr-primary mt-2">R$ ${doc.valor.toFixed(2)}</p>` : ''}
                    <div class="mt-3 flex items-center gap-3">
                        ${!isCompleted ? `
                            <button 
                                onclick="openDocumentModal(${doc.id})"
                                class="py-1 px-3 bg-white border border-slate-200 rounded-lg text-sm text-govbr-primary hover:bg-slate-50 transition-colors"
                            >
                                <i data-lucide="${doc.tipo === 'upload' ? 'upload' : doc.tipo === 'pagamento' ? 'credit-card' : 'pen-tool'}" class="w-4 h-4 inline-block mr-1"></i>
                                ${doc.tipo === 'upload' ? 'Anexar / Editar' : doc.tipo === 'pagamento' ? 'Efetuar Pagamento' : 'Preencher'}
                            </button>
                        ` : `
                            <button onclick="openDocumentModal(${doc.id})" class="py-1 px-3 bg-white border border-green-200 rounded-lg text-sm text-green-700">Ver histórico</button>
                        `}
                        <!-- Botão de edição removido -->
                    </div>
                    
                    <div class="mt-2 text-xs text-slate-400">${doc.history && doc.history.length ? doc.history.length + ' registro(s) de histórico' : 'Sem histórico'}</div>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
    
    lucide.createIcons();
}

function renderTimeline() {
    const container = document.getElementById('timeline');
    
    const events = [
        { time: 'Agora', text: 'Solicitação criada', icon: 'plus-circle', color: 'govbr-primary' },
        { time: 'Em breve', text: 'Análise documental', icon: 'search', color: 'slate-400' },
        { time: 'Pendente', text: 'Emissão do alvará', icon: 'award', color: 'slate-300' }
    ];
    
    if (currentEvent.status === 'aprovado_automatico') {
        events[0] = { time: 'Agora', text: 'Aprovado automaticamente', icon: 'zap', color: 'govbr-success' };
        events[1] = { time: 'Concluído', text: 'Alvará disponível', icon: 'check-circle', color: 'govbr-success' };
        events.pop();
    }
    
    container.innerHTML = events.map((event, idx) => `
        <div class="flex gap-3">
            <div class="flex flex-col items-center">
                <div class="w-8 h-8 bg-${event.color}/10 rounded-full flex items-center justify-center">
                    <i data-lucide="${event.icon}" class="w-4 h-4 text-${event.color}"></i>
                </div>
                ${idx < events.length - 1 ? `<div class="w-0.5 h-8 bg-slate-200 my-1"></div>` : ''}
            </div>
            <div class="pb-4">
                <p class="text-sm font-medium text-slate-800">${event.text}</p>
                <p class="text-xs text-slate-400">${event.time}</p>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function updateTaxes() {
    const taxDoc = currentEvent.documentos.find(d => d.tipo === 'pagamento');
    if (taxDoc) {
        const total = taxDoc.valor;
        const iss = total * 0.6;
        const expediente = total * 0.4;
        
        document.getElementById('taxISS').textContent = `R$ ${iss.toFixed(2)}`;
        document.getElementById('taxExpediente').textContent = `R$ ${expediente.toFixed(2)}`;
        document.getElementById('taxTotal').textContent = `R$ ${total.toFixed(2)}`;
        document.getElementById('paymentAmount').textContent = `R$ ${total.toFixed(2)}`;
        
        if (taxDoc.status === 'pago') {
            document.getElementById('btnPagar').disabled = true;
            document.getElementById('btnPagar').innerHTML = `
                <i data-lucide="check-circle" class="w-5 h-5"></i>
                Pago
            `;
            document.getElementById('btnPagar').className = 'w-full py-3 bg-govbr-success text-white font-semibold rounded-xl cursor-not-allowed flex items-center justify-center gap-2';
            lucide.createIcons();
        }
    }
}

// Modal functions
function openDocumentModal(docId) {
    currentDocId = docId;
    const doc = currentEvent.documentos.find(d => d.id === docId);

    document.getElementById('modalTitle').textContent = doc.documento;
    document.getElementById('modalOrgao').textContent = doc.orgao;

    const content = document.getElementById('modalContent');

    // Modal com abas: Envio e Histórico
    let activeTab = (doc.status === 'aprovado' || doc.status === 'pago') ? 'historico' : 'envio';
    function renderEnvio() {
        if (doc.tipo === 'autodeclaracao') {
            return `
                <div class="mb-4">
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                        <div class="flex items-start gap-3">
                            <i data-lucide="info" class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"></i>
                            <p class="text-sm text-blue-700">Em conformidade com a <strong>Lei de Liberdade Econômica (Lei 13.874/19)</strong>, a autodeclaração possui validade jurídica.</p>
                        </div>
                    </div>
                    <div class="space-y-4">
                        <label class="flex items-start gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                            <input type="checkbox" id="decl1" class="mt-1 w-5 h-5 text-govbr-primary rounded border-slate-300 focus:ring-govbr-primary">
                            <span class="text-sm text-slate-700">Declaro que o evento não apresenta risco à segurança pública.</span>
                        </label>
                        <label class="flex items-start gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                            <input type="checkbox" id="decl2" class="mt-1 w-5 h-5 text-govbr-primary rounded border-slate-300 focus:ring-govbr-primary">
                            <span class="text-sm text-slate-700">Declaro estar ciente das responsabilidades legais.</span>
                        </label>
                        <label class="flex items-start gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                            <input type="checkbox" id="decl3" class="mt-1 w-5 h-5 text-govbr-primary rounded border-slate-300 focus:ring-govbr-primary">
                            <span class="text-sm text-slate-700">Declaro que o local atende às normas de som e segurança.</span>
                        </label>
                    </div>
                    <textarea id="docComment" class="w-full mt-4 p-3 border rounded-md" placeholder="Adicionar observação (opcional)"></textarea>
                    <div class="mt-4 flex gap-2">
                        <button onclick="submitAutodeclaracao()" class="flex-1 py-3 bg-govbr-primary text-white rounded-xl">Assinar</button>
                    </div>
                </div>
            `;
        } else if (doc.tipo === 'upload') {
            return `
                <div class="mb-4">
                    <div class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center mb-3">
                        <input type="file" id="fileInput" class="hidden" onchange="handleFileSelect(event)">
                        <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i data-lucide="upload-cloud" class="w-8 h-8 text-slate-400"></i>
                        </div>
                        <p class="font-medium text-slate-700">Clique para fazer upload</p>
                        <p class="text-sm text-slate-500 mt-1">PDF, JPG ou PNG até 10MB</p>
                        <button onclick="document.getElementById('fileInput').click()" class="mt-3 py-2 px-4 bg-white border rounded">Selecionar arquivo</button>
                    </div>
                    <div id="filePreview" class="hidden mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                        <div class="flex items-center gap-3">
                            <i data-lucide="file-check" class="w-6 h-6 text-green-600"></i>
                            <div class="flex-1">
                                <p class="font-medium text-green-800" id="fileName">documento.pdf</p>
                                <p class="text-sm text-green-600">Arquivo selecionado</p>
                            </div>
                        </div>
                    </div>
                    <textarea id="docComment" class="w-full mt-4 p-3 border rounded-md" placeholder="Adicionar observação (opcional)"></textarea>
                    <div class="mt-4">
                        <button id="btnSubmitFile" onclick="submitDocument()" class="py-2 px-3 bg-govbr-primary text-white rounded-xl disabled:opacity-50 w-full" disabled>Enviar</button>
                    </div>
                </div>
            `;
        }
        return '';
    }
    function renderHistory() {
        return (doc.history || []).length ? (doc.history || []).map(h => {
            let color = 'bg-slate-50 border-slate-100';
            let text = 'text-slate-700';
            if (h.action === 'aprovado' || h.action === 'reenviado') {
                color = 'bg-green-50 border-green-200';
                text = 'text-green-700';
            } else if (h.action === 'reprovado' || h.action === 'comentario') {
                color = 'bg-red-50 border-red-200';
                text = 'text-red-700';
            }
            return `
                <div class="mb-2 p-3 rounded-lg ${color} border">
                    <div class="flex items-center justify-between text-xs text-slate-500">
                        <div>${new Date(h.date).toLocaleString('pt-BR')}</div>
                        <div class="font-medium">${h.by}</div>
                    </div>
                    <div class="mt-1 text-sm ${text}"><strong>${h.action.toUpperCase()}</strong> - ${h.comment || ''}</div>
                </div>
            `;
        }).join('') : '<div class="text-sm text-slate-400">Sem histórico</div>';
    }
    content.innerHTML = `
        <div class="mb-4 flex gap-2 border-b pb-2">
            <button id="tabEnvio" class="px-4 py-2 rounded-t-lg font-semibold ${activeTab === 'envio' ? 'bg-govbr-primary text-white' : 'bg-slate-100 text-slate-700'}">Envio</button>
            <button id="tabHistorico" class="px-4 py-2 rounded-t-lg font-semibold ${activeTab === 'historico' ? 'bg-govbr-primary text-white' : 'bg-slate-100 text-slate-700'}">Histórico</button>
        </div>
        <div id="tabContent"></div>
    `;
    function updateTab() {
        document.getElementById('tabContent').innerHTML = activeTab === 'envio' ? renderEnvio() : renderHistory();
        lucide.createIcons();
    }
    document.getElementById('tabEnvio').onclick = () => { activeTab = 'envio'; updateTab(); };
    document.getElementById('tabHistorico').onclick = () => { activeTab = 'historico'; updateTab(); };
    updateTab();
    lucide.createIcons();
    document.body.style.overflow = 'hidden';
    document.getElementById('documentModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('documentModal').classList.add('hidden');
    // Restore body scroll
    document.body.style.overflow = '';
    currentDocId = null;
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('filePreview').classList.remove('hidden');
        document.getElementById('fileName').textContent = file.name;
        const btn = document.getElementById('btnSubmitFile');
        if (btn) btn.disabled = false;
        // store filename in temp field
        const doc = currentEvent.documentos.find(d => d.id === currentDocId);
        if (doc) doc._selectedFile = file.name;
        lucide.createIcons();
    }
}

function submitAutodeclaracao() {
    const decl1 = document.getElementById('decl1').checked;
    const decl2 = document.getElementById('decl2').checked;
    const decl3 = document.getElementById('decl3').checked;
    
    if (!decl1 || !decl2 || !decl3) {
        alert('Por favor, marque todas as declarações para continuar.');
        return;
    }
    
    // Update document status
    const doc = currentEvent.documentos.find(d => d.id === currentDocId);
    doc.status = 'aprovado';
    addDocHistory(doc, 'aprovado', JSON.parse(localStorage.getItem('aprovaEventos_db')).user.nome, 'Autodeclaração assinada');
    saveEventData();

    closeModal();
    renderDocuments();
    updateProgress();

    showToast('Autodeclaração assinada com sucesso!', 'success');
}

function submitDocument() {
    // Update document status and history
    const doc = currentEvent.documentos.find(d => d.id === currentDocId);
    doc.status = 'em_analise';
    addDocHistory(doc, 'enviado', JSON.parse(localStorage.getItem('aprovaEventos_db')).user.nome, document.getElementById('docComment') ? document.getElementById('docComment').value : 'Envio via plataforma');
    saveEventData();

    closeModal();
    renderDocuments();
    updateProgress();

    showToast('Documento enviado para análise!', 'success');

    // Simulate approval after 3 seconds
    setTimeout(() => {
        doc.status = 'aprovado';
        addDocHistory(doc, 'aprovado', 'Analista', 'Documento aprovado após conferência');
        saveEventData();
        renderDocuments();
        updateProgress();
        showToast(`${doc.documento} aprovado!`, 'success');
    }, 3000);
}

function simulateReject(docId) {
    const doc = currentEvent.documentos.find(d => d.id === docId);
    if (!doc) return;
    const comment = prompt('Comentário de reprovação (simulado):', 'Falta assinatura digital');
    addDocHistory(doc, 'reprovado', 'Analista', comment || 'Reprovado (simulado)');
    doc.status = 'comentario';
    saveEventData();
    renderDocuments();
    showToast('Documento marcado como reprovado (simulado)', 'success');
}

function simulateApprove(docId) {
    const doc = currentEvent.documentos.find(d => d.id === docId);
    if (!doc) return;
    addDocHistory(doc, 'aprovado', 'Analista', 'Aprovação simulada');
    doc.status = 'aprovado';
    saveEventData();
    renderDocuments();
    updateProgress();
    showToast('Documento aprovado (simulado)', 'success');
}

// Payment Modal
function openPaymentModal() {
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    document.getElementById('paymentModal').classList.remove('hidden');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.add('hidden');
    // Restore body scroll
    document.body.style.overflow = '';
}

function simulatePayment() {
    const taxDoc = currentEvent.documentos.find(d => d.tipo === 'pagamento');
    if (taxDoc) {
        taxDoc.status = 'pago';
        saveEventData();
    }
    
    closePaymentModal();
    renderDocuments();
    updateProgress();
    updateTaxes();
    
    showToast('Pagamento confirmado!', 'success');
}

function saveEventData() {
    const db = JSON.parse(localStorage.getItem('aprovaEventos_db'));
    db.currentEvent = currentEvent;
    
    // Update in events array too
    const eventIndex = db.events.findIndex(e => e.id === currentEvent.id);
    if (eventIndex >= 0) {
        db.events[eventIndex] = currentEvent;
    }
    
    localStorage.setItem('aprovaEventos_db', JSON.stringify(db));
}

function downloadAlvara() {
    // Open Alvará modal with declaration and approved documents summary
    const approved = currentEvent.documentos.filter(d => d.status === 'aprovado' || d.status === 'pago');
    const content = document.getElementById('alvaraContent');
    content.innerHTML = `
        <div class="p-4 bg-slate-50 border rounded">
            <p class="text-sm text-slate-700">Declaro, para os devidos fins, que a Prefeitura de Londrina concede permissão para a realização do evento <strong>${currentEvent.nome}</strong> no local <strong>${currentEvent.local}</strong>, na data <strong>${formatDate(currentEvent.data)}</strong>, conforme a documentação aprovada.</p>
        </div>
        <div class="mt-4">
            <h4 class="font-semibold">Documentos aprovados</h4>
            <ul class="mt-2 space-y-2 text-sm">
                ${approved.map(d => `<li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-green-600"></i>${d.documento} <span class="text-slate-400 text-xs ml-2">(${d.orgao})</span></li>`).join('')}
            </ul>
        </div>
    `;
    lucide.createIcons();
    // Lock body scroll and show modal
    document.body.style.overflow = 'hidden';
    document.getElementById('alvaraModal').classList.remove('hidden');
}

function closeAlvaraModal() {
    document.getElementById('alvaraModal').classList.add('hidden');
    // Restore body scroll
    document.body.style.overflow = '';
}

function printAlvara() {
    // Simple print of modal content
    const content = document.getElementById('alvaraContent').innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Alvará - ${currentEvent.nome}</title></head><body>${content}</body></html>`);
    w.document.close();
    w.print();
}

function editDocumentTitle(docId) {
    const doc = currentEvent.documentos.find(d => d.id === docId);
    if (!doc) return;
    const newTitle = prompt('Editar título do documento:', doc.documento);
    if (newTitle && newTitle.trim()) {
        doc.documento = newTitle.trim();
        addDocHistory(doc, 'editado', JSON.parse(localStorage.getItem('aprovaEventos_db')).user.nome, 'Título editado pelo solicitante');
        saveEventData();
        renderDocuments();
        showToast('Título atualizado', 'success');
    }
}

function saveEditedTitle() {
    const input = document.getElementById('editTitle');
    if (!input) return;
    const newTitle = input.value.trim();
    const doc = currentEvent.documentos.find(d => d.id === currentDocId);
    if (doc && newTitle) {
        doc.documento = newTitle;
        addDocHistory(doc, 'editado', JSON.parse(localStorage.getItem('aprovaEventos_db')).user.nome, 'Título editado');
        saveEventData();
        renderDocuments();
        showToast('Título salvo', 'success');
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 p-4 rounded-xl shadow-lg z-50 flex items-center gap-3 fade-in ${
        type === 'success' ? 'bg-green-500 text-white' : 'bg-slate-800 text-white'
    }`;
    toast.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" class="w-5 h-5 flex-shrink-0"></i>
        <span class="text-sm font-medium">${message}</span>
    `;
    document.body.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function celebrateApproval() {
    const colors = ['#1351B4', '#168821', '#FFCD07', '#E52207', '#2670E8'];
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 2 + 's';
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 3000);
        }, i * 50);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', loadEventData);

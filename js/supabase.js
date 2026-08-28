// ═══════════════════════════════════════════════
//  CATIA-SE BRECHÓ — Supabase Client
// ═══════════════════════════════════════════════
const SUPABASE_URL = 'https://uiptsqnhqubyqftsysib.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcHRzcW5ocXVieXFmdHN5c2liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTkzNTMsImV4cCI6MjEwMzQzNTM1M30.xs926sZwbB2_FrSkagcpZLB2EiudU5-XtAMl1bs03ng';

// ── API Helper ──
async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${getToken() || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || '',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || res.statusText);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Auth Helper ──
function getToken() {
  const s = localStorage.getItem('sb_session');
  return s ? JSON.parse(s).access_token : null;
}
function getLoggedUser() {
  const s = localStorage.getItem('sb_session');
  if (!s) return null;
  const session = JSON.parse(s);
  return session.user || null;
}
function getUserProfile() {
  const s = localStorage.getItem('sb_profile');
  return s ? JSON.parse(s) : null;
}
function isAdmin() {
  const p = getUserProfile();
  return p && p.is_admin === true;
}
function isLogged() { return !!getToken(); }

// ── AUTH ──
const Auth = {
  async signUp(nome, email, senha) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha, data: { nome } })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || data.msg);
    if (data.access_token) {
      localStorage.setItem('sb_session', JSON.stringify(data));
      await Auth.loadProfile(data.user.id);
    }
    return data;
  },

  async signIn(email, senha) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha })
    });
    const data = await res.json();
    if (data.error || data.error_description) throw new Error(data.error_description || data.error);
    localStorage.setItem('sb_session', JSON.stringify(data));
    await Auth.loadProfile(data.user.id);
    return data;
  },

  async loadProfile(userId) {
    try {
      const rows = await sbFetch(`usuarios?id=eq.${userId}&select=*`);
      if (rows && rows[0]) {
        localStorage.setItem('sb_profile', JSON.stringify(rows[0]));
      }
    } catch(e) { console.warn('Profile load:', e); }
  },

  signOut() {
    localStorage.removeItem('sb_session');
    localStorage.removeItem('sb_profile');
    window.location.href = 'index.html';
  }
};

// ── PRODUTOS ──
const Produtos = {
  async listar(filtros = {}) {
    let query = 'produtos?ativo=eq.true&order=criado_em.desc';
    if (filtros.categoria)  query += `&categoria=eq.${encodeURIComponent(filtros.categoria)}`;
    if (filtros.destaque)   query += `&destaque=eq.${filtros.destaque}`;
    if (filtros.ordem === 'price_asc')  query += '&order=preco.asc';
    if (filtros.ordem === 'price_desc') query += '&order=preco.desc';
    return await sbFetch(query);
  },

  async buscar(termo) {
    return await sbFetch(`produtos?ativo=eq.true&or=(nome.ilike.*${termo}*,marca.ilike.*${termo}*,categoria.ilike.*${termo}*)&order=criado_em.desc`);
  },

  async salvar(prod) {
    if (prod.id) {
      return await sbFetch(`produtos?id=eq.${prod.id}`, {
        method: 'PATCH', prefer: 'return=representation',
        body: JSON.stringify(prod)
      });
    }
    return await sbFetch('produtos', {
      method: 'POST', prefer: 'return=representation',
      body: JSON.stringify(prod)
    });
  },

  async excluir(id) {
    return await sbFetch(`produtos?id=eq.${id}`, { method: 'DELETE' });
  },

  async uploadFoto(file, prodId) {
    const ext  = file.name.split('.').pop();
    const path = `${prodId}/${Date.now()}.${ext}`;
    const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/produtos/${path}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${getToken() || SUPABASE_KEY}`,
        'Content-Type': file.type
      },
      body: file
    });
    if (!res.ok) throw new Error('Erro no upload');
    return `${SUPABASE_URL}/storage/v1/object/public/produtos/${path}`;
  }
};

// ── MENSAGENS ──
const Mensagens = {
  async enviar(dados) {
    return await sbFetch('mensagens', {
      method: 'POST', prefer: 'return=representation',
      body: JSON.stringify(dados)
    });
  },
  async listar() {
    return await sbFetch('mensagens?order=criado_em.desc&select=*');
  },
  async responder(id, resposta) {
    return await sbFetch(`mensagens?id=eq.${id}`, {
      method: 'PATCH', prefer: 'return=representation',
      body: JSON.stringify({ resposta, status: 'replied', respondido_em: new Date().toISOString() })
    });
  }
};

// ── NOTIFICAÇÕES ──
const Notificacoes = {
  async listar() {
    const user = getLoggedUser();
    if (!user) return [];
    return await sbFetch(`notificacoes?usuario_id=eq.${user.id}&order=criado_em.desc`);
  },
  async criar(userId, msg, resposta = '') {
    return await sbFetch('notificacoes', {
      method: 'POST',
      body: JSON.stringify({ usuario_id: userId, mensagem: msg, resposta })
    });
  },
  async marcarLida(id) {
    return await sbFetch(`notificacoes?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify({ lida: true })
    });
  },
  async marcarTodasLidas() {
    const user = getLoggedUser();
    if (!user) return;
    return await sbFetch(`notificacoes?usuario_id=eq.${user.id}`, {
      method: 'PATCH', body: JSON.stringify({ lida: true })
    });
  }
};

// ── CARRINHO ──
const Carrinho = {
  async listar() {
    return await sbFetch('carrinho?select=*,produtos(*)&order=adicionado_em.desc');
  },
  async adicionar(produtoId) {
    const user = getLoggedUser();
    if (!user) throw new Error('Login necessário');
    return await sbFetch('carrinho', {
      method: 'POST', prefer: 'return=representation',
      body: JSON.stringify({ usuario_id: user.id, produto_id: produtoId })
    });
  },
  async remover(id) {
    return await sbFetch(`carrinho?id=eq.${id}`, { method: 'DELETE' });
  },
  async limpar() {
    const user = getLoggedUser();
    if (!user) return;
    return await sbFetch(`carrinho?usuario_id=eq.${user.id}`, { method: 'DELETE' });
  }
};

// ── PERFIL ──
const Perfil = {
  async atualizar(dados) {
    const user = getLoggedUser();
    if (!user) return;
    const updated = await sbFetch(`usuarios?id=eq.${user.id}`, {
      method: 'PATCH', prefer: 'return=representation',
      body: JSON.stringify(dados)
    });
    if (updated && updated[0]) localStorage.setItem('sb_profile', JSON.stringify(updated[0]));
    return updated;
  },
  async alterarSenha(novaSenha) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: novaSenha })
    });
    return res.json();
  },
  async enderecos() {
    const user = getLoggedUser();
    if (!user) return [];
    return await sbFetch(`enderecos?usuario_id=eq.${user.id}&order=criado_em.desc`);
  },
  async salvarEndereco(end) {
    const user = getLoggedUser();
    if (!user) return;
    return await sbFetch('enderecos', {
      method: 'POST', prefer: 'return=representation',
      body: JSON.stringify({ ...end, usuario_id: user.id })
    });
  },
  async removerEndereco(id) {
    return await sbFetch(`enderecos?id=eq.${id}`, { method: 'DELETE' });
  }
};

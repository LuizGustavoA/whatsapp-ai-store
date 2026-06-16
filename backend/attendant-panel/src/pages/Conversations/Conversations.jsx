import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios.js';

const formatDate = (value) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [handoffOnly, setHandoffOnly] = useState(false);

  const loadConversations = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    return api
      .get('/attendant/conversations', {
        params: handoffOnly ? { handoff: 'true' } : {}
      })
      .then((response) => {
        setConversations(response.data.conversations || []);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar conversas.'))
      .finally(() => {
        if (!silent) {
          setLoading(false);
        }
      });
  }, [handoffOnly]);

  const loadDetail = useCallback((conversationId, silent = false) => {
    if (!silent) {
      setDetailLoading(true);
    }

    return api
      .get(`/attendant/conversations/${conversationId}`)
      .then((response) => {
        setDetail(response.data);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar conversa.'))
      .finally(() => {
        if (!silent) {
          setDetailLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadConversations(true);

      if (selectedId) {
        loadDetail(selectedId, true);
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [loadConversations, loadDetail, selectedId]);

  const uniqueMessages = useMemo(() => {
    const seen = new Set();

    return (detail?.messages || []).filter((message) => {
      if (seen.has(message.id)) {
        return false;
      }

      seen.add(message.id);
      return true;
    });
  }, [detail?.messages]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleSelect = (conversationId) => {
    setSelectedId(conversationId);
    setReplyText('');
  };

  const handleSendReply = async (event) => {
    event.preventDefault();

    if (!selectedId || !replyText.trim()) {
      return;
    }

    setSending(true);
    setError('');

    try {
      await api.post(`/attendant/conversations/${selectedId}/reply`, {
        message: replyText.trim()
      });

      setReplyText('');
      await loadDetail(selectedId);
      await loadConversations();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleResumeBot = async () => {
    if (!selectedId) {
      return;
    }

    setError('');

    try {
      await api.patch(`/attendant/conversations/${selectedId}/resume-bot`);
      await loadDetail(selectedId);
      await loadConversations();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao reativar bot.');
    }
  };

  return (
    <div className="conversations-page">
      <h1 className="page-title">WhatsApp</h1>
      <p className="page-subtitle">
        Todas as conversas do WhatsApp (bot + atendimento humano). Clique em uma para ver as mensagens.
      </p>

      {error && <p className="error-text">{error}</p>}

      <div className="conversations-toolbar panel">
        <label className="conversations-filter">
          <input
            type="checkbox"
            checked={handoffOnly}
            onChange={(event) => {
              setHandoffOnly(event.target.checked);
              setSelectedId(null);
            }}
          />
          Mostrar só aguardando atendente
        </label>
        <button type="button" className="btn-secondary" onClick={loadConversations}>
          Atualizar
        </button>
      </div>

      <div className="conversations-layout">
        <div className="panel conversations-list">
          {loading ? (
            <p>Carregando...</p>
          ) : conversations.length === 0 ? (
            <p>Nenhuma conversa encontrada.</p>
          ) : (
            <ul>
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={`conversation-item ${
                      selectedId === conversation.id ? 'active' : ''
                    } ${conversation.botPaused ? 'handoff' : ''}`}
                    onClick={() => handleSelect(conversation.id)}
                  >
                    <strong>{conversation.customerName || conversation.phoneNumber}</strong>
                    {conversation.botPaused && (
                      <span className="conversation-handoff-badge">Aguardando</span>
                    )}
                    <small>{conversation.lastMessage || 'Sem mensagens'}</small>
                    <small className="conversation-meta">{formatDate(conversation.updatedAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel conversations-chat">
          {!selectedId ? (
            <p className="conversations-empty">Selecione uma conversa para ver as mensagens.</p>
          ) : detailLoading && !detail ? (
            <p>Carregando conversa...</p>
          ) : detail ? (
            <>
              <div className="conversations-chat-header">
                <div>
                  <strong>{detail.customerName || detail.phoneNumber}</strong>
                  <small>{detail.phoneNumber}</small>
                </div>
                <div className="conversations-chat-actions">
                  {detail.botPaused && (
                    <button type="button" className="btn-secondary" onClick={handleResumeBot}>
                      Reativar bot
                    </button>
                  )}
                </div>
              </div>

              {detail.activeOrder && (
                <div className="conversations-order-banner">
                  Pedido ativo: {detail.activeOrder.statusLabel}
                  {detail.activeOrder.dailyOrderNumber != null &&
                    ` (#${detail.activeOrder.dailyOrderNumber})`}
                </div>
              )}

              {detail.deliveryAddress && (
                <div className="conversations-order-banner">
                  Endereço: {detail.deliveryAddress}
                </div>
              )}

              <div className="conversations-messages">
                {uniqueMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`conversation-bubble conversation-bubble-${message.direction}`}
                  >
                    <p>{message.content}</p>
                    <small>{formatDate(message.createdAt)}</small>
                  </div>
                ))}
              </div>

              <form className="conversations-reply-form" onSubmit={handleSendReply}>
                <textarea
                  rows={3}
                  placeholder="Digite sua resposta ao cliente..."
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                />
                <button type="submit" className="btn-primary inline" disabled={sending}>
                  {sending ? 'Enviando...' : 'Enviar no WhatsApp'}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

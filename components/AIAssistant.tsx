'use client';

/**
 * AIAssistant - Client-side document intelligence chat interface
 * Zero server calls. All AI runs in browser via transformers.js
 * 
 * Integration: Add as a slide-out panel or modal in CommandEditor
 */

import React, { useState, useRef, useEffect } from 'react';
import { documentAI } from '../utils/aiRag';
import type { ChatMessage, AIQueryResult } from '../types';

interface Props {
  pdfTextByPage: string[];
  fileName: string;
  currentPage: number;
  onNavigateToPage: (pageIndex: number) => void;
}

export const AIAssistant: React.FC<Props> = ({ 
  pdfTextByPage, 
  fileName, 
  currentPage,
  onNavigateToPage 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !isIndexed && pdfTextByPage.length > 0) {
      indexDocument();
    }
  }, [isOpen, pdfTextByPage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const indexDocument = async () => {
    setIsIndexing(true);
    try {
      await documentAI.initialize();
      await documentAI.loadDocument(pdfTextByPage, fileName);
      setIsIndexed(true);
      setMessages(prev => [...prev, {
        id: 'welcome',
        role: 'assistant',
        content: `I've analyzed **${fileName}** (${pdfTextByPage.length} pages). Ask me anything about this document, or try:\n• "Summarize this document"\n• "What are the key points on page ${currentPage + 1}?"\n• "Find mentions of [topic]"`,
        timestamp: Date.now(),
      }]);
    } catch (error: any) {
      console.error('AI init failed:', error);
      setMessages(prev => [...prev, {
        id: 'error',
        role: 'assistant',
        content: 'Could not load the AI model: ' + (error?.message || String(error)) +
          '\n\nThe first use downloads a ~20MB model from HuggingFace; check your connection and try again.',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let result: AIQueryResult;

      // Handle special commands
      const lowerInput = input.toLowerCase();
      if (lowerInput.includes('summarize') || lowerInput.includes('summary')) {
        const summary = await documentAI.summarize();
        result = {
          answer: `**Summary:**\n\n${summary}`,
          relevantChunks: [],
          confidence: 1,
          processingTime: 0,
        };
      } else {
        result = await documentAI.query(input.trim());
      }

      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        timestamp: Date.now(),
        sources: result.relevantChunks.map(c => ({
          pageIndex: c.pageIndex,
          text: c.text.substring(0, 200) + '...',
        })),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your question.',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickActions = [
    { label: 'Summarize', icon: '📋', query: 'Summarize this document' },
    { label: 'Key points', icon: '🎯', query: `What are the key points on page ${currentPage + 1}?` },
    { label: 'Find dates', icon: '📅', query: 'Find all dates mentioned in this document' },
    { label: 'Obligations', icon: '⚖️', query: 'What are the obligations or requirements mentioned?' },
  ];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: isOpen ? '#dc2626' : '#2563eb',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
        }}
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          right: '20px',
          bottom: '88px',
          width: '400px',
          height: '600px',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 999,
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            background: '#f8fafc',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🤖</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Document AI</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {isIndexing ? 'Analyzing document...' : 
                   isIndexed ? 'Ready to answer questions' : 'Click to start'}
                </div>
              </div>
              {isIndexing && (
                <div style={{ marginLeft: 'auto' }}>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #e5e7eb',
                    borderTopColor: '#2563eb',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {messages.length === 0 && !isIndexing && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🤖</div>
                <div style={{ fontWeight: 500, marginBottom: '8px' }}>AI Document Assistant</div>
                <div style={{ fontSize: '13px' }}>
                  Ask questions about your document. All processing happens in your browser — 
                  your data never leaves this device.
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
                  color: msg.role === 'user' ? 'white' : '#1f2937',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div dangerouslySetInnerHTML={{ 
                  __html: msg.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br/>')
                }} />

                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px', opacity: 0.7 }}>
                      Sources:
                    </div>
                    {msg.sources.map((source, idx) => (
                      <button
                        key={idx}
                        onClick={() => onNavigateToPage(source.pageIndex)}
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          color: msg.role === 'user' ? '#bfdbfe' : '#2563eb',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          padding: '2px 0',
                          textDecoration: 'underline',
                        }}
                      >
                        Page {source.pageIndex + 1}: {source.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '4px', padding: '10px' }}>
                <div style={dotStyle} />
                <div style={{ ...dotStyle, animationDelay: '0.2s' }} />
                <div style={{ ...dotStyle, animationDelay: '0.4s' }} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          {messages.length <= 1 && isIndexed && (
            <div style={{
              padding: '0 16px 8px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
            }}>
              {quickActions.map(action => (
                <button
                  key={action.label}
                  onClick={() => {
                    setInput(action.query);
                    setTimeout(() => handleSend(), 0);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: '1px solid #e5e7eb',
                    background: 'white',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {action.icon} {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: '8px',
          }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isIndexed ? "Ask about this document..." : "Initializing AI..."}
              disabled={!isIndexed || isLoading}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '24px',
                border: '1px solid #e5e7eb',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!isIndexed || isLoading || !input.trim()}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: 'none',
                background: (!isIndexed || isLoading || !input.trim()) ? '#e5e7eb' : '#2563eb',
                color: 'white',
                cursor: (!isIndexed || isLoading || !input.trim()) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

const dotStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  background: '#9ca3af',
  borderRadius: '50%',
  animation: 'pulse 1.4s ease-in-out infinite',
};

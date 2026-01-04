import React, { useRef, useState } from 'react';
import { Option, ExamConfig } from '../types';
import { scanAnswerKey } from '../services/geminiService';

interface AnswerKeyInputProps {
  // Exam Code Props
  examKeys: Record<string, Record<number, Option>>;
  activeCode: string;
  onCodeChange: (code: string) => void;
  onAddCode: () => void;
  onRenameCode: () => void; // Added prop
  onDeleteCode: () => void;

  // Key Manipulation Props
  answerKey: Record<number, Option>; // Currently active key
  setAnswerKey: (newKey: Record<number, Option>) => void; // Update active key
  config: ExamConfig;
  setConfig: React.Dispatch<React.SetStateAction<ExamConfig>>;
  hasImage: boolean;
  onGrade: () => void;
  isProcessing: boolean;
}

export const AnswerKeyInput: React.FC<AnswerKeyInputProps> = ({ 
    examKeys,
    activeCode,
    onCodeChange,
    onAddCode,
    onRenameCode,
    onDeleteCode,
    answerKey, 
    setAnswerKey,
    config,
    setConfig,
    hasImage,
    onGrade,
    isProcessing
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scanStats, setScanStats] = useState<{found: number, total: number} | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Generate A, B, C, D...
  const options = Array.from({ length: config.optionCount }, (_, i) => String.fromCharCode(65 + i));
  const questions = Array.from({ length: config.questionCount }, (_, i) => i + 1);
  const filledCount = Object.values(answerKey).filter(v => v !== null).length;
  
  // Calculate potential score per question based on maxScore and active questions (or total questions if none filled)
  // We use config.questionCount for estimation when setting up the exam
  const scorePerQuestion = config.questionCount > 0 ? (config.maxScore / config.questionCount).toFixed(2) : "0";

  const handleSelect = (questionId: number, option: Option) => {
    setAnswerKey({
      ...answerKey,
      [questionId]: answerKey[questionId] === option ? null : option
    });
  };

  const handleRandomFill = () => {
    if(!window.confirm(`Tự động điền ngẫu nhiên đáp án cho mã đề ${activeCode}?`)) return;
    const newKey: Record<number, Option> = {};
    questions.forEach(q => newKey[q] = options[Math.floor(Math.random() * options.length)] as Option);
    setAnswerKey(newKey);
  };

  const handleClearKey = () => {
    if(!window.confirm(`Xóa toàn bộ đáp án của mã đề ${activeCode}?`)) return;
    const newKey: Record<number, Option> = {};
    questions.forEach(q => newKey[q] = null);
    setAnswerKey(newKey);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setUploadProgress(0);
    setScanStats(null);
    
    const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
            if (prev >= 90) return prev;
            const increment = prev < 40 ? 4 : (prev < 80 ? 2 : 1);
            return prev + increment;
        });
    }, 200);

    try {
        // Now returns { answers, config }
        const { answers: extractedAnswers, config: detectedConfig } = await scanAnswerKey(file);
        
        clearInterval(progressInterval);
        setUploadProgress(100);
        await new Promise(resolve => setTimeout(resolve, 300));

        let foundCount = 0;
        const newKey: Record<number, Option> = {};
        
        // Update Config if detected
        let currentQuestionCount = config.questionCount;
        if (detectedConfig) {
            setConfig(prev => ({
                ...prev,
                questionCount: detectedConfig.questionCount,
                optionCount: detectedConfig.optionCount
            }));
            currentQuestionCount = detectedConfig.questionCount;
        }

        Object.entries(extractedAnswers).forEach(([qStr, ans]) => {
            const qNum = parseInt(qStr);
            // Ensure we only populate valid keys for detected config
            if (qNum <= currentQuestionCount && ans) {
                newKey[qNum] = ans;
                foundCount++;
            }
        });
        
        if (foundCount === 0) {
            alert("Không tìm thấy đáp án nào trong ảnh. Vui lòng thử lại với ảnh rõ nét hơn, đủ ánh sáng và chụp thẳng góc.");
            return;
        }
        
        // Merge with potentially empty newKey structure in parent useEffect, but here we just set what we found
        // The App component will handle resizing the key object map via useEffect on config change
        setAnswerKey(newKey);
        
        setScanStats({ found: foundCount, total: currentQuestionCount });
        setTimeout(() => setScanStats(null), 3000);

    } catch (error) {
        console.error("Failed to extract key", error);
        alert("Không thể nhận diện đáp án. Vui lòng tải lên ảnh rõ nét hơn, đủ ánh sáng và đảm bảo phiếu đáp án phẳng phiu.");
    } finally {
        setIsScanning(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusText = (progress: number) => {
      if (progress < 40) return "Uploading...";
      if (progress < 80) return "AI Auto-Detecting...";
      return "Configuring...";
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 h-full flex flex-col">
      {/* Header Section */}
      <div className="flex flex-col gap-3 mb-2 border-b border-slate-100 pb-3">
        <div className="flex flex-col gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800">1. Đáp Án (Key)</h2>
            
            {/* Exam Code Management */}
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Mã đề:</span>
                <select 
                    value={activeCode}
                    onChange={(e) => onCodeChange(e.target.value)}
                    className="flex-1 min-w-0 bg-white border border-slate-300 text-slate-800 text-sm rounded focus:ring-indigo-500 focus:border-indigo-500 p-1.5 font-bold"
                >
                    {Object.keys(examKeys).map(code => (
                        <option key={code} value={code}>{code}</option>
                    ))}
                </select>
                <button 
                    onClick={onAddCode}
                    title="Thêm mã đề mới"
                    className="p-1.5 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button 
                    onClick={onRenameCode}
                    title="Đổi tên mã đề"
                    className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button 
                    onClick={onDeleteCode}
                    title="Xóa mã đề hiện tại"
                    className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>

            <div className="flex justify-between items-center mt-1">
                <div className="text-xs text-slate-500" aria-live="polite">
                    Mã <span className="font-bold text-slate-700">{activeCode}</span>: <span className="font-bold text-indigo-600">{filledCount}/{config.questionCount}</span> câu
                </div>
                
                <div className="flex gap-1">
                    <button 
                        onClick={handleRandomFill}
                        className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Điền ngẫu nhiên (Random)"
                        aria-label="Randomly fill all answers"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 12 17.19 16.5 19.79"/><polyline points="3.29 8.71 12 13.71 20.71 8.71"/><line x1="12" y1="22" x2="12" y2="13.71"/></svg>
                    </button>
                    <button 
                        onClick={handleClearKey}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Xóa tất cả (Clear)"
                        aria-label="Clear all answers"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                    <div className="w-px h-8 bg-slate-200 mx-1 self-center"></div>
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                        title="Cài đặt đề thi"
                        aria-label={showSettings ? "Hide settings" : "Show settings"}
                        aria-expanded={showSettings}
                        aria-controls="settings-panel"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                </div>
            </div>
        </div>
        
        {/* Settings Panel */}
        {showSettings && (
            <div id="settings-panel" className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-2 animate-fade-in text-sm space-y-3">
                <div className="grid grid-cols-1 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="question-count">Số câu hỏi (Question Count)</label>
                        <div className="flex items-center gap-2 mb-2">
                             <input 
                                id="question-count"
                                type="number" 
                                min="1" max="200" 
                                value={config.questionCount}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setConfig(prev => ({...prev, questionCount: Math.min(200, Math.max(1, val))}));
                                }}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-bold text-slate-700"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[10, 20, 30, 40, 50, 60, 80, 100].map(num => (
                                <button
                                    key={num}
                                    onClick={() => setConfig(prev => ({...prev, questionCount: num}))}
                                    className={`px-2 py-1 text-xs rounded border transition-colors ${config.questionCount === num ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="option-count">Số đáp án</label>
                            <select 
                                id="option-count"
                                value={config.optionCount}
                                onChange={(e) => setConfig(prev => ({...prev, optionCount: parseInt(e.target.value)}))}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                            >
                                <option value={4}>4 (A-D)</option>
                                <option value={5}>5 (A-E)</option>
                            </select>
                        </div>
                         <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="max-score">Thang điểm</label>
                            <input 
                                    id="max-score"
                                    type="number"
                                    min="1" max="1000"
                                    value={config.maxScore}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 10;
                                        setConfig(prev => ({...prev, maxScore: val}));
                                    }}
                                    className="w-full px-2 py-1.5 border border-slate-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Scan Button */}
        <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            aria-label={isScanning ? "Scanning answer key..." : "Scan answer key from image"}
            className={`
                w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg border transition-all relative overflow-hidden group
                ${isScanning 
                    ? 'bg-white border-indigo-200 text-indigo-800 cursor-wait' 
                    : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 shadow-sm'}
            `}
        >
            {isScanning ? (
                    <>
                        <div 
                            className="absolute left-0 top-0 bottom-0 bg-indigo-50/50 transition-all duration-300 ease-out" 
                            style={{ width: '100%' }} 
                        />
                        <div 
                            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-100 via-indigo-200 to-indigo-100 transition-all duration-200 ease-linear animate-pulse opacity-70" 
                            style={{ width: `${uploadProgress}%` }} 
                        />
                        
                        <div className="relative z-10 flex items-center gap-2">
                             <svg className="animate-spin h-4 w-4 text-indigo-600" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                             <span className="font-bold text-indigo-700">
                                {getStatusText(uploadProgress)} {uploadProgress}%
                            </span>
                        </div>
                    </>
            ) : (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500 group-hover:text-indigo-600"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    <span>Quét Key từ ảnh (Auto-Detect)</span>
                </>
            )}
        </button>
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={handleFileUpload}
            tabIndex={-1}
            aria-hidden="true"
        />
        
        {scanStats && (
            <div className="bg-green-50 text-green-700 px-3 py-2 rounded-md text-xs flex items-center gap-2 animate-fade-in border border-green-100" role="status">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Tìm thấy {scanStats.found} đáp án cho mã {activeCode}!
            </div>
        )}
      </div>
      
      {/* Answer List */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
        {filledCount === 0 && !isScanning ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200 m-2 z-10 p-4 text-center">
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <p className="text-slate-600 font-medium text-sm mb-1">Mã đề {activeCode} chưa có đáp án</p>
                <p className="text-slate-400 text-xs mb-4">Nhập thủ công hoặc quét từ ảnh</p>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white text-indigo-600 text-sm font-bold border border-indigo-200 rounded-lg shadow-sm hover:bg-indigo-50 transition-all"
                >
                    Quét từ ảnh ngay
                </button>
            </div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-6 gap-y-3 pb-2">
            {questions.map((qId) => (
                <div key={qId} className="flex items-center justify-between border-b border-slate-50 pb-2" role="group" aria-label={`Question ${qId}`}>
                <span className="w-8 font-mono text-slate-500 font-semibold text-sm">{qId}.</span>
                <div className="flex gap-1 flex-wrap justify-end">
                    {options.map((opt) => (
                    <button
                        key={opt}
                        onClick={() => handleSelect(qId, opt)}
                        aria-label={`Select option ${opt} for question ${qId}`}
                        aria-pressed={answerKey[qId] === opt}
                        className={`
                        w-7 h-7 rounded-full text-[10px] font-bold transition-all duration-200
                        ${answerKey[qId] === opt 
                            ? 'bg-indigo-600 text-white shadow-md transform scale-105' 
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}
                        `}
                    >
                        {opt}
                    </button>
                    ))}
                </div>
                </div>
            ))}
            </div>
        )}
      </div>

      <div className="pt-4 mt-2 border-t border-slate-100">
            <button
                onClick={onGrade}
                disabled={filledCount === 0 || !hasImage || isProcessing}
                aria-label="Grade exam now"
                className={`
                    w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2
                    ${filledCount > 0 && hasImage && !isProcessing
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'}
                `}
            >
                {isProcessing ? (
                     <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Đang chấm...
                     </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                        Chấm Điểm (Grade Now)
                    </>
                )}
            </button>
            {!hasImage && filledCount > 0 && (
                <p className="text-[10px] text-center text-amber-600 mt-2 font-medium bg-amber-50 py-1 rounded border border-amber-100">
                    ⚠ Hãy tải ảnh bài làm bên phải để chấm
                </p>
            )}
      </div>
    </div>
  );
};
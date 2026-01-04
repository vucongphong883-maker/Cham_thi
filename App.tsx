import React, { useState, useEffect } from 'react';
import { AnswerKeyInput } from './components/AnswerKeyInput';
import { ResultView } from './components/ResultView';
import { analyzeAnswerSheet } from './services/geminiService';
import { Option, GradingSummary, StudentResult, ExamConfig } from './types';

const STORAGE_KEY_EXAM_KEYS = 'autoGrade_examKeys'; // New key for multiple codes
// Fallback for migration
const STORAGE_KEY_OLD_ANSWERS = 'autoGrade_answerKey'; 

const STORAGE_KEY_IMAGE = 'autoGrade_studentImage';
const STORAGE_KEY_CONFIG = 'autoGrade_config';
const STORAGE_KEY_AUTO_GRADE = 'autoGrade_isAuto';
const STORAGE_KEY_ACTIVE_CODE = 'autoGrade_activeCode';

const App: React.FC = () => {
  // Config State
  const [config, setConfig] = useState<ExamConfig>(() => {
    try {
        const savedConfig = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            return { questionCount: 40, optionCount: 4, maxScore: 10, ...parsed };
        }
    } catch(e) {}
    return { questionCount: 40, optionCount: 4, maxScore: 10 };
  });

  // State for Multiple Exam Codes
  // Structure: { "101": { 1: "A", 2: "B"... }, "102": { ... } }
  const [examKeys, setExamKeys] = useState<Record<string, Record<number, Option>>>(() => {
    try {
      const savedKeys = localStorage.getItem(STORAGE_KEY_EXAM_KEYS);
      if (savedKeys) {
        return JSON.parse(savedKeys);
      }
      
      // Migration: Check for old single key format
      const oldKey = localStorage.getItem(STORAGE_KEY_OLD_ANSWERS);
      if (oldKey) {
          return { "101": JSON.parse(oldKey) };
      }
    } catch (e) {
      console.error("Failed to load saved keys", e);
    }
    
    // Default initial
    return { "101": {} };
  });

  const [activeCode, setActiveCode] = useState<string>(() => {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_CODE);
      const keys = Object.keys(examKeys);
      if (saved && keys.includes(saved)) return saved;
      return keys[0] || "101";
  });

  const [studentCode, setStudentCode] = useState<string>(() => Object.keys(examKeys)[0] || "101");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gradingSummary, setGradingSummary] = useState<GradingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Auto Grade Toggle State
  const [autoGrade, setAutoGrade] = useState<boolean>(() => {
      return localStorage.getItem(STORAGE_KEY_AUTO_GRADE) === 'true';
  });

  // Undo/Redo History State
  const [history, setHistory] = useState<GradingSummary[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Helper to generate option labels (A, B, C...)
  const getOptionLabels = () => {
    return Array.from({ length: config.optionCount }, (_, i) => String.fromCharCode(65 + i));
  };

  // Restore image from storage on mount
  useEffect(() => {
    const savedImage = localStorage.getItem(STORAGE_KEY_IMAGE);
    if (savedImage) {
      setImagePreview(savedImage);
      fetch(savedImage)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "restored_exam.png", { type: blob.type });
          setSelectedFile(file);
        })
        .catch(e => console.error("Failed to restore image file", e));
    }
  }, []);

  // Sync answerKey size when questionCount changes (for all codes)
  useEffect(() => {
    setExamKeys(prev => {
        const newKeys = { ...prev };
        Object.keys(newKeys).forEach(code => {
            const currentKey = { ...newKeys[code] };
            // Remove extras
            Object.keys(currentKey).forEach(k => {
                if (parseInt(k) > config.questionCount) delete currentKey[parseInt(k)];
            });
            // Add missing
            for (let i = 1; i <= config.questionCount; i++) {
                if (currentKey[i] === undefined) currentKey[i] = null;
            }
            newKeys[code] = currentKey;
        });
        return newKeys;
    });
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  }, [config]); 

  // Auto-save Exam Keys
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EXAM_KEYS, JSON.stringify(examKeys));
  }, [examKeys]);

  // Auto-save Active Code
  useEffect(() => {
      localStorage.setItem(STORAGE_KEY_ACTIVE_CODE, activeCode);
  }, [activeCode]);

  // Auto-save Auto Grade Setting
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_AUTO_GRADE, String(autoGrade));
  }, [autoGrade]);

  // Ensure activeCode/studentCode validity and sync logic
  useEffect(() => {
      // If the currently selected student/active code is deleted, switch to the first available
      const availableCodes = Object.keys(examKeys);
      if (availableCodes.length > 0) {
          if (!examKeys[activeCode]) {
              setActiveCode(availableCodes[0]);
          }
          if (!examKeys[studentCode]) {
              setStudentCode(availableCodes[0]);
          }
      }
  }, [examKeys, studentCode, activeCode]);

  // Sync Student Code with Active Code automatically for better UX
  // When user changes the "Answer Key" dropdown, we assume they want to grade for that code
  useEffect(() => {
      if (examKeys[activeCode]) {
          setStudentCode(activeCode);
      }
  }, [activeCode]); // Only sync when activeCode changes explicitly

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Exam Code Management Handlers
  const handleAddCode = () => {
      const newCode = prompt("Nhập mã đề mới (ví dụ: 102):");
      if (newCode && !examKeys[newCode]) {
          setExamKeys(prev => {
              const emptyKey: Record<number, Option> = {};
              for (let i = 1; i <= config.questionCount; i++) emptyKey[i] = null;
              return { ...prev, [newCode]: emptyKey };
          });
          setActiveCode(newCode);
          setStudentCode(newCode); // Sync
      } else if (newCode && examKeys[newCode]) {
          alert("Mã đề này đã tồn tại!");
          setActiveCode(newCode);
      }
  };

  const handleRenameCode = () => {
      const newName = prompt("Nhập tên mới cho mã đề:", activeCode);
      if (newName && newName !== activeCode) {
          if (examKeys[newName]) {
              alert("Tên mã đề này đã tồn tại!");
              return;
          }
          
          setExamKeys(prev => {
              const newKeys = { ...prev };
              newKeys[newName] = newKeys[activeCode];
              delete newKeys[activeCode];
              return newKeys;
          });
          
          // Update active/student code references
          if (activeCode === studentCode) setStudentCode(newName);
          setActiveCode(newName);
      }
  };

  const handleDeleteCode = () => {
      if (Object.keys(examKeys).length <= 1) {
          alert("Phải giữ lại ít nhất một mã đề.");
          return;
      }
      if (window.confirm(`Bạn có chắc muốn xóa mã đề ${activeCode}?`)) {
          setExamKeys(prev => {
              const newKeys = { ...prev };
              delete newKeys[activeCode];
              return newKeys;
          });
          // useEffect will handle setting new activeCode
      }
  };

  const updateActiveKey = (newKey: Record<number, Option>) => {
      setExamKeys(prev => ({
          ...prev,
          [activeCode]: newKey
      }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Reset input value so the same file can be selected again if needed
      e.target.value = '';
      
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setImagePreview(objectUrl);
      setGradingSummary(null);
      setHistory([]);
      setHistoryIndex(-1);
      setError(null);

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        try {
          localStorage.setItem(STORAGE_KEY_IMAGE, base64String);
        } catch (err) {
          console.warn("Image too large to save to LocalStorage");
        }
      };
      reader.readAsDataURL(file);

      // Trigger Auto Grade if enabled
      if (autoGrade) {
          // Pre-validation before processing
          const currentKey = examKeys[studentCode];
          const filledKeys = currentKey ? Object.values(currentKey).filter(v => v !== null).length : 0;
          
          if (!currentKey) {
             setError(`Lỗi: Mã đề ${studentCode} không tồn tại.`);
          } else if (filledKeys === 0) {
             setError(`Không thể tự động chấm: Mã đề ${studentCode} chưa có đáp án (Key). Vui lòng nhập đáp án ở cột trái.`);
          } else {
             // Safe to process
             processExam(file);
          }
      }
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setGradingSummary(null);
    setHistory([]);
    setHistoryIndex(-1);
    localStorage.removeItem(STORAGE_KEY_IMAGE);
  };

  const handleScanOnly = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setError(null);

    try {
      const validOptions = getOptionLabels();
      const analysisResult = await analyzeAnswerSheet(selectedFile, config.questionCount, validOptions);
      const results: StudentResult[] = [];

      for (let i = 1; i <= config.questionCount; i++) {
        const data = analysisResult[i] || { answer: null, box2d: null };
        results.push({
          questionId: i,
          studentAnswer: data.answer,
          correctAnswer: null, 
          isCorrect: false,
          box2d: data.box2d || undefined
        });
      }

      const summary = {
        totalQuestions: config.questionCount,
        results,
        imageUrl: imagePreview || undefined
      };

      setGradingSummary(summary);
      setHistory([summary]);
      setHistoryIndex(0);

    } catch (err: any) {
      console.error("Scan processing error:", err);
      setError("Không thể nhận diện bài làm. Vui lòng thử lại với ảnh rõ nét hơn.\n- Đảm bảo đủ ánh sáng.\n- Giữ camera thẳng góc.\n- Chữ viết/tô rõ ràng.");
    } finally {
      setIsProcessing(false);
    }
  };

  const processExam = async (fileOverride?: File) => {
    const fileToUse = fileOverride || selectedFile;
    if (!fileToUse) return;

    const currentKey = examKeys[studentCode];
    if (!currentKey) {
        setError("Mã đề đã chọn không tồn tại.");
        return;
    }

    const filledKeys = Object.values(currentKey).filter(v => v !== null).length;
    if (filledKeys === 0) {
      setError(`Mã đề ${studentCode} chưa có đáp án. Vui lòng nhập đáp án trước.`);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const validOptions = getOptionLabels();
      const analysisResult = await analyzeAnswerSheet(fileToUse, config.questionCount, validOptions);

      let correctCount = 0;
      const results: StudentResult[] = [];

      for (let i = 1; i <= config.questionCount; i++) {
        const correct = currentKey[i];
        const data = analysisResult[i] || { answer: null, box2d: null };
        const student = data.answer;
        
        const isCorrect = correct !== null && correct === student;
        if (isCorrect) correctCount++;

        results.push({
          questionId: i,
          studentAnswer: student,
          correctAnswer: correct,
          isCorrect,
          box2d: data.box2d || undefined
        });
      }

      // Calculate score based on maxScore config
      const totalActiveQuestions = filledKeys > 0 ? filledKeys : config.questionCount; 
      const score = (correctCount / totalActiveQuestions) * config.maxScore;

      const summary = {
        totalQuestions: totalActiveQuestions,
        correctCount,
        score,
        maxScore: config.maxScore,
        results,
        imageUrl: fileOverride ? URL.createObjectURL(fileOverride) : (imagePreview || undefined)
      };

      setGradingSummary(summary);
      setHistory([summary]);
      setHistoryIndex(0);

    } catch (err: any) {
      console.error("Exam processing error:", err);
      setError("Không thể chấm bài. Vui lòng kiểm tra:\n1. Ảnh đủ ánh sáng, không bị mờ.\n2. Chụp thẳng góc với phiếu.\n3. Nét tô/viết rõ ràng.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateResult = (questionId: number, newAnswer: Option) => {
    if (!gradingSummary) return;

    const prev = gradingSummary;
    const newResults = prev.results.map(item => {
      if (item.questionId === questionId) {
         // Recalculate isCorrect if grading
         const isCorrect = item.correctAnswer ? item.correctAnswer === newAnswer : false;
         return { ...item, studentAnswer: newAnswer, isCorrect };
      }
      return item;
    });

    let nextState = { ...prev, results: newResults };
    
    // Only recalculate score if we are in grading mode
    if (prev.score !== undefined && prev.correctCount !== undefined) {
       const correctCount = newResults.filter(r => r.isCorrect).length;
       const score = (correctCount / prev.totalQuestions) * (prev.maxScore || 10);
       nextState = {
           ...nextState,
           correctCount,
           score
       };
    }

    setGradingSummary(nextState);
    
    // Add to history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(nextState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setGradingSummary(history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGradingSummary(history[newIndex]);
    }
  };

  const resetGrading = () => {
    handleRemoveImage();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-10">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              A
            </div>
            <h1 className="text-lg sm:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              AutoGrade AI
            </h1>
          </div>
          <div className="text-xs sm:text-sm text-slate-500 hidden sm:block">
            Gemini-Powered Scantron Grader
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          
          {/* Left Column: Answer Key */}
          <div className="lg:col-span-4 h-[500px] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-24">
            <AnswerKeyInput 
              examKeys={examKeys}
              activeCode={activeCode}
              onCodeChange={setActiveCode}
              onAddCode={handleAddCode}
              onRenameCode={handleRenameCode}
              onDeleteCode={handleDeleteCode}
              answerKey={examKeys[activeCode] || {}} // Fallback to empty if key missing
              setAnswerKey={updateActiveKey} 
              config={config}
              setConfig={setConfig}
              hasImage={!!selectedFile}
              onGrade={() => processExam()}
              isProcessing={isProcessing}
            />
          </div>

          {/* Right Column: Upload & Results */}
          <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-6">
            
            {!gradingSummary && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-8 text-center transition-all">
                
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-6 gap-4">
                     <div className="text-left">
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">2. Tải lên bài làm</h2>
                        <p className="text-sm text-slate-500 mt-1">Chọn mã đề trước khi tải ảnh lên.</p>
                     </div>

                     <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100 shadow-sm">
                        <span className="text-sm font-semibold text-indigo-800 whitespace-nowrap">Mã đề chấm:</span>
                        <select
                            value={studentCode}
                            onChange={(e) => setStudentCode(e.target.value)}
                            className="bg-white text-indigo-700 font-bold text-sm border border-indigo-200 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            {Object.keys(examKeys).map(code => (
                                <option key={code} value={code}>{code}</option>
                            ))}
                        </select>
                     </div>
                </div>
                
                {!imagePreview ? (
                  <label className="flex flex-col items-center justify-center w-full h-48 sm:h-64 border-2 border-indigo-100 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-indigo-50/50 transition-colors group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-10 h-10 sm:w-12 sm:h-12 mb-3 sm:mb-4 text-indigo-400 group-hover:text-indigo-600 transition-colors" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                      </svg>
                      <p className="mb-2 text-sm text-slate-500"><span className="font-semibold text-indigo-600">Click to upload</span> or drag</p>
                      <p className="text-xs text-slate-400">PNG, JPG</p>
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      capture="environment"
                      onChange={handleFileChange} 
                    />
                  </label>
                ) : (
                  <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-black/5 group">
                    <img 
                      src={imagePreview} 
                      alt="Student Exam" 
                      className="w-full h-auto max-h-[60vh] sm:max-h-96 object-contain" 
                    />
                    <button 
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 bg-white/90 hover:bg-white text-slate-700 p-2 rounded-full shadow-sm transition-all"
                      title="Remove image"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                )}

                <div className="mt-6 sm:mt-8 flex flex-col items-center gap-3">
                    
                  {/* Exam Code Selector & Auto Grade Toggle */}
                  <div className="w-full max-w-md space-y-3 mb-2">
                      {/* Auto Grade Toggle */}
                      <div className="flex items-center justify-between bg-indigo-50 px-4 py-2.5 rounded-lg border border-indigo-100">
                          <div className="flex flex-col text-left">
                             <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${autoGrade ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                <span className="text-sm font-bold text-indigo-900">Tự động chấm</span>
                             </div>
                             <span className="text-xs text-indigo-700">Dùng mã: <strong>{studentCode}</strong></span>
                          </div>
                          <button 
                            onClick={() => setAutoGrade(!autoGrade)}
                            aria-label="Toggle auto grading"
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${autoGrade ? 'bg-indigo-600' : 'bg-slate-300'}`}
                          >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoGrade ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                      </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center w-full">
                    {/* Hide the manual Grade button if Auto Grade is ON and processing hasn't started, to reduce clutter, or show it as fallback */}
                    <button
                        onClick={() => processExam()}
                        disabled={!selectedFile || isProcessing}
                        className={`
                        w-full sm:w-auto px-6 py-3 rounded-lg font-bold text-white shadow-lg shadow-indigo-200 transition-all transform flex items-center justify-center gap-2
                        ${!selectedFile || isProcessing 
                            ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                            : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-105 active:scale-95'}
                        `}
                    >
                        {isProcessing ? (
                        <>
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Đang chấm điểm...
                        </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                {autoGrade ? "Chấm lại thủ công" : `Chấm theo Mã ${studentCode}`}
                            </>
                        )}
                    </button>

                    <button
                        onClick={handleScanOnly}
                        disabled={!selectedFile || isProcessing}
                        className={`
                            w-full sm:w-auto px-4 py-3 rounded-lg font-semibold border-2 transition-all flex items-center justify-center gap-2
                            ${!selectedFile || isProcessing 
                                ? 'border-slate-100 text-slate-300 cursor-not-allowed' 
                                : 'border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200'}
                        `}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        Chỉ nhận diện (Không chấm)
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 flex items-start gap-2 text-left">
                    <svg className="shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span className="whitespace-pre-line">{error}</span>
                  </div>
                )}
              </div>
            )}

            {gradingSummary && (
              <ResultView 
                summary={gradingSummary} 
                onReset={resetGrading} 
                onUpdateResult={handleUpdateResult}
                availableOptions={getOptionLabels()}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
              />
            )}
            
            {!gradingSummary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex md:block items-center gap-4">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold md:mb-3">1</div>
                    <div>
                        <h3 className="font-semibold text-slate-800 text-sm">Nhập Đáp Án</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Tạo các mã đề và nhập key.</p>
                    </div>
                 </div>
                 <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex md:block items-center gap-4">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold md:mb-3">2</div>
                    <div>
                        <h3 className="font-semibold text-slate-800 text-sm">Chụp Ảnh</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Tải lên bài làm và chọn mã đề.</p>
                    </div>
                 </div>
                 <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex md:block items-center gap-4">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold md:mb-3">3</div>
                    <div>
                        <h3 className="font-semibold text-slate-800 text-sm">AI Chấm Điểm</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Tự động nhận diện và tính điểm.</p>
                    </div>
                 </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
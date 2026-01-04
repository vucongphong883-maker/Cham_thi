import React, { useState, useRef, useEffect } from 'react';
import { GradingSummary, Option } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ResultViewProps {
  summary: GradingSummary;
  onReset: () => void;
  onUpdateResult: (questionId: number, newAnswer: Option) => void;
  availableOptions: string[];
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const ResultView: React.FC<ResultViewProps> = ({ 
    summary, 
    onReset,
    onUpdateResult,
    availableOptions,
    onUndo,
    onRedo,
    canUndo,
    canRedo
}) => {
  const isGraded = summary.score !== undefined && summary.correctCount !== undefined;
  
  // Persist preferences
  const [showOverlay, setShowOverlay] = useState(() => {
      try {
          return localStorage.getItem('autoGrade_showOverlay') !== 'false';
      } catch { return true; }
  });
  
  const [showDetails, setShowDetails] = useState(() => {
      try {
          return localStorage.getItem('autoGrade_showOverlayDetails') !== 'false';
      } catch { return true; }
  });

  const [isExporting, setIsExporting] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const resultContainerRef = useRef<HTMLDivElement>(null);
  
  const toggleOverlay = () => {
      const newVal = !showOverlay;
      setShowOverlay(newVal);
      localStorage.setItem('autoGrade_showOverlay', String(newVal));
  };

  const toggleDetails = () => {
      const newVal = !showDetails;
      setShowDetails(newVal);
      localStorage.setItem('autoGrade_showOverlayDetails', String(newVal));
  };
  
  // Only calculate chart data if graded
  const chartData = isGraded ? [
    { name: 'Correct', value: summary.correctCount, color: '#22c55e' },
    { name: 'Incorrect', value: summary.totalQuestions - (summary.correctCount || 0), color: '#ef4444' },
  ] : [];

  const maxScore = summary.maxScore || 10;
  const scorePerQuestion = summary.totalQuestions > 0 ? maxScore / summary.totalQuestions : 0;

  const handleExportCSV = () => {
    // BOM for UTF-8 support in Excel
    const BOM = "\uFEFF";
    let csvContent = BOM + "Question,Student Answer,Correct Answer,Status,Points\n";
    
    // Add Summary header info
    if (isGraded) {
        csvContent += `# Summary,Score: ${summary.score?.toFixed(2)} / ${maxScore},Correct: ${summary.correctCount} / ${summary.totalQuestions},,\n`;
    } else {
        csvContent += `# Summary,Scanned Questions: ${summary.totalQuestions},,,\n`;
    }
    csvContent += "\n";

    summary.results.forEach(row => {
        const points = isGraded && row.isCorrect ? scorePerQuestion.toFixed(2) : "0";
        const status = isGraded ? (row.isCorrect ? "Correct" : "Incorrect") : "Scanned";
        const correctVal = row.correctAnswer || "-";
        
        csvContent += `${row.questionId},${row.studentAnswer || ""},${correctVal},${status},${points}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `exam_result_${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDF = async () => {
    if (!resultContainerRef.current) return;
    setIsExporting(true);

    try {
        const canvas = await html2canvas(resultContainerRef.current, {
            scale: 2, // Higher scale for better quality
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        // Fit width
        const finalWidth = pdfWidth; 
        const finalHeight = (imgHeight * pdfWidth) / imgWidth;

        // If height > page height, we might need multiple pages, but for now let's squeeze or just print one long image if short
        if (finalHeight > pdfHeight) {
            let heightLeft = finalHeight;
            let position = 0;
            
            pdf.addImage(imgData, 'PNG', 0, position, finalWidth, finalHeight);
            heightLeft -= pdfHeight;

            while (heightLeft >= 0) {
                position = heightLeft - finalHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, finalWidth, finalHeight);
                heightLeft -= pdfHeight;
            }
        } else {
             pdf.addImage(imgData, 'PNG', 0, 0, finalWidth, finalHeight);
        }

        pdf.save(`grading-result-${new Date().toISOString().slice(0,10)}.pdf`);

    } catch (err) {
        console.error("PDF Export failed", err);
        alert("Có lỗi khi tạo file PDF. Vui lòng thử lại.");
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 animate-fade-in" ref={resultContainerRef}>
      <div className="flex flex-col sm:flex-row justify-between items-start mb-4 sm:mb-6 border-b border-slate-100 pb-4 gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">
            {isGraded ? "Kết Quả Chấm Thi" : "Kết Quả Nhận Diện"}
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm">
            {isGraded ? `Reviewing results for ${summary.totalQuestions} questions` : "Answers extracted from the student sheet"}
          </p>
        </div>
        
        <div className="flex items-center gap-2 self-end sm:self-auto no-print">
            <button
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (Hoàn tác)"
                data-html2canvas-ignore="true"
                className={`p-2 rounded-lg border transition-colors ${canUndo ? 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600' : 'border-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Làm lại)"
                data-html2canvas-ignore="true"
                className={`p-2 rounded-lg border transition-colors ${canRedo ? 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600' : 'border-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
            </button>
            <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block"></div>
            <button 
                onClick={handleDownloadPDF}
                disabled={isExporting}
                data-html2canvas-ignore="true"
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
            >
                {isExporting ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                )}
                Lưu PDF
            </button>
            <button 
                onClick={handleExportCSV}
                data-html2canvas-ignore="true"
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                CSV
            </button>
        </div>
      </div>

      {isGraded && summary.correctCount !== undefined && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
            {/* Score Card */}
            <div className="col-span-2 md:col-span-1 bg-indigo-50 p-3 sm:p-4 rounded-lg border border-indigo-100 flex flex-col items-center justify-center shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-1 opacity-10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </div>
                <div className="flex items-baseline gap-1 relative z-10">
                    <span className="text-3xl sm:text-4xl font-black text-indigo-700">{summary.score?.toFixed(2)}</span>
                    <span className="text-xs sm:text-sm font-bold text-indigo-400">/{maxScore}</span>
                </div>
                <span className="text-[10px] sm:text-xs text-indigo-600 font-bold uppercase tracking-wider mt-1 relative z-10">Tổng Điểm</span>
            </div>

            {/* Correct Stats */}
            <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-100 flex flex-col items-center justify-center">
                <span className="text-2xl sm:text-3xl font-bold text-green-700">{summary.correctCount}</span>
                <span className="text-[10px] sm:text-xs text-green-600 font-medium uppercase tracking-wide">Đúng (Correct)</span>
            </div>

            {/* Incorrect Stats */}
            <div className="bg-red-50 p-3 sm:p-4 rounded-lg border border-red-100 flex flex-col items-center justify-center">
                <span className="text-2xl sm:text-3xl font-bold text-red-700">{summary.totalQuestions - summary.correctCount}</span>
                <span className="text-[10px] sm:text-xs text-red-600 font-medium uppercase tracking-wide">Sai (Incorrect)</span>
            </div>
            
            {/* Chart */}
            <div 
                className="col-span-2 md:col-span-1 h-24 sm:h-28 w-full flex items-center justify-center bg-slate-50 rounded-lg border border-slate-100"
                role="img"
                aria-label={`Pie chart showing ${summary.correctCount} correct answers and ${summary.totalQuestions - (summary.correctCount || 0)} incorrect answers.`}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={20}
                            outerRadius={35}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
      )}

      {/* Image Overlay Section */}
      {summary.imageUrl && (
          <div className="mb-6 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 relative">
              <div className="absolute top-2 right-2 z-20 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-slate-200 p-1.5 flex items-center gap-3" data-html2canvas-ignore="true">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-600 pl-1 uppercase">Hiển thị</span>
                    <button 
                        onClick={toggleOverlay}
                        aria-pressed={showOverlay}
                        aria-label="Toggle results overlay"
                        className={`
                            w-8 h-4 rounded-full relative transition-colors duration-200 ease-in-out
                            ${showOverlay ? 'bg-indigo-600' : 'bg-slate-300'}
                        `}
                    >
                        <span className={`
                            absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transform transition-transform duration-200
                            ${showOverlay ? 'translate-x-4' : 'translate-x-0'}
                        `} />
                    </button>
                  </div>

                  {showOverlay && isGraded && (
                     <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                         <span className="text-[10px] font-bold text-slate-600 uppercase">Đáp án</span>
                         <button 
                             onClick={toggleDetails}
                             aria-pressed={showDetails}
                             aria-label="Toggle detailed labels"
                             className={`
                                 w-8 h-4 rounded-full relative transition-colors duration-200 ease-in-out
                                 ${showDetails ? 'bg-indigo-600' : 'bg-slate-300'}
                             `}
                         >
                             <span className={`
                                 absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transform transition-transform duration-200
                                 ${showDetails ? 'translate-x-4' : 'translate-x-0'}
                             `} />
                         </button>
                     </div>
                  )}
              </div>

              <div className="relative w-full" ref={imageContainerRef}>
                <img 
                    src={summary.imageUrl} 
                    alt="Exam Sheet" 
                    className="w-full h-auto block" 
                    crossOrigin="anonymous" 
                />
                
                {/* SVG Overlay */}
                {showOverlay && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        {summary.results.map((res) => {
                            if (!res.box2d) return null;
                            const [ymin, xmin, ymax, xmax] = res.box2d;
                            // Convert 1000-scale to percentage for responsiveness
                            const top = ymin / 10;
                            const left = xmin / 10;
                            const width = (xmax - xmin) / 10;
                            const height = (ymax - ymin) / 10;
                            
                            // Color logic
                            let strokeColor = "#6366f1"; // Default indigo
                            let fillColor = "rgba(99, 102, 241, 0.1)";
                            
                            if (isGraded) {
                                strokeColor = res.isCorrect ? "#22c55e" : "#ef4444";
                                fillColor = res.isCorrect ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)";
                            }

                            // Text Label logic
                            let labelText = `${res.questionId}`;
                            let labelWidth = 20; // Default width
                            
                            // If Question ID is large, expand slightly
                            if (res.questionId > 9) labelWidth = 24;
                            if (res.questionId > 99) labelWidth = 28;

                            // If incorrect, show expected answer e.g. "5•A"
                            if (isGraded && !res.isCorrect && res.correctAnswer && showDetails) {
                                labelText = `${res.questionId}•${res.correctAnswer}`;
                                labelWidth = res.questionId > 9 ? 34 : 30;
                            }

                            // Position label above or below based on position to avoid clipping
                            const labelOnTop = top > 4; // Arbitrary 4% threshold
                            const labelY = labelOnTop ? top - 2.5 : top + height + 0.5;
                            const textY = labelOnTop ? top - 2.5 : top + height + 0.5;

                            return (
                                <g key={res.questionId}>
                                    <rect 
                                        x={`${left}%`} 
                                        y={`${top}%`} 
                                        width={`${width}%`} 
                                        height={`${height}%`}
                                        fill={fillColor}
                                        stroke={strokeColor}
                                        strokeWidth="2"
                                        rx="2"
                                    />
                                    {/* Question label tag */}
                                    <rect 
                                        x={`${left}%`} 
                                        y={`${labelY}%`} 
                                        width={labelWidth} 
                                        height="14" 
                                        fill={strokeColor} 
                                        rx="2"
                                    />
                                    <text 
                                        x={`${left}%`} 
                                        y={`${textY}%`} 
                                        dx={labelWidth / 2} 
                                        dy="10" 
                                        fontSize="9" 
                                        fill="white" 
                                        textAnchor="middle" 
                                        fontWeight="bold"
                                    >
                                        {labelText}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                )}
              </div>
              <div className="bg-slate-50 px-3 py-2 text-[10px] text-slate-400 text-center border-t border-slate-200">
                  {showOverlay ? (
                      isGraded 
                        ? `AI Overlay Active: Green = Correct, Red = Incorrect ${showDetails ? '(Q•Key)' : '(Question Only)'}`
                        : "AI Overlay Active: Detected Answers"
                  ) : "Overlay Hidden"}
              </div>
          </div>
      )}

      <h3 className="font-semibold text-slate-700 mb-2 sm:mb-3 text-sm sm:text-base">Chi tiết (Details):</h3>
      <div className="overflow-y-auto max-h-[350px] sm:max-h-[400px] pr-1 sm:pr-2 custom-scrollbar border rounded-lg border-slate-100">
        <table className="w-full text-xs sm:text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
                <tr>
                    <th className="px-2 sm:px-4 py-2 font-medium" scope="col">Q</th>
                    {isGraded && <th className="px-2 sm:px-4 py-2 font-medium" scope="col">Key</th>}
                    <th className="px-2 sm:px-4 py-2 font-medium" scope="col">Answer</th>
                    {isGraded && <th className="px-2 sm:px-4 py-2 font-medium text-right" scope="col">Pts</th>}
                    {isGraded && <th className="px-2 sm:px-4 py-2 font-medium text-right" scope="col">Status</th>}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {summary.results.map((res) => (
                    <tr 
                        key={res.questionId} 
                        className={`transition-colors ${
                            isGraded 
                            ? (res.isCorrect ? 'bg-green-50/50' : 'bg-red-50/50') 
                            : 'bg-white'
                        }`}
                    >
                        <td className="px-2 sm:px-4 py-2 font-mono text-slate-600">
                            <div className="flex items-center gap-2">
                                {isGraded && (
                                    res.isCorrect ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 shrink-0"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    )
                                )}
                                <span>{res.questionId}</span>
                            </div>
                        </td>
                        
                        {isGraded && (
                            <td className="px-2 sm:px-4 py-2 font-bold text-indigo-600">{res.correctAnswer || '-'}</td>
                        )}

                        <td className="px-2 sm:px-4 py-2 font-bold text-slate-800">
                             <select 
                                value={res.studentAnswer || ""} 
                                onChange={(e) => onUpdateResult(res.questionId, e.target.value || null)}
                                aria-label={`Change answer for question ${res.questionId}`}
                                data-html2canvas-ignore="true"
                                className={`
                                    bg-transparent border-b border-dashed border-slate-300 hover:border-indigo-400 focus:outline-none focus:border-indigo-600 
                                    cursor-pointer py-1 pr-4 sm:pr-6 pl-1 sm:pl-2 -ml-1 sm:-ml-2 rounded hover:bg-slate-50 transition-colors appearance-none font-bold relative z-10 w-full sm:w-auto
                                    ${!res.studentAnswer ? 'text-slate-400 italic font-normal' : 'text-slate-800'}
                                    ${isGraded && !res.isCorrect && res.studentAnswer ? 'text-red-600' : ''}
                                `}
                                style={{ 
                                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                                    backgroundPosition: 'right 0.2rem center',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundSize: '1em 1em'
                                 }}
                            >
                                <option value="" className="text-slate-400">Empty</option>
                                {availableOptions.map(opt => (
                                    <option key={opt} value={opt} className="text-slate-800 not-italic font-bold">{opt}</option>
                                ))}
                            </select>
                            {/* Render plain text for PDF export, hidden in view */}
                            <span className="hidden print-only-text font-bold" style={{ display: 'none' }}>
                                {res.studentAnswer || "-"}
                            </span>
                        </td>

                        {isGraded && (
                            <td className="px-2 sm:px-4 py-2 text-right font-medium text-slate-600">
                                {res.isCorrect ? `+${scorePerQuestion.toFixed(2)}` : '0'}
                            </td>
                        )}

                        {isGraded && (
                            <td className="px-2 sm:px-4 py-2 text-right">
                                {res.isCorrect ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-green-100 text-green-800">
                                        Đúng
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-red-100 text-red-800">
                                        Sai
                                    </span>
                                )}
                            </td>
                        )}
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
      <style>{`
        .print-only-text { display: none; }
        @media print {
            .print-only-text { display: inline !important; }
            select { display: none !important; }
        }
      `}</style>

      <div className="mt-4 sm:mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 no-print" data-html2canvas-ignore="true">
        <button 
            onClick={handleDownloadPDF}
            className="w-full sm:flex-1 py-3 bg-white text-red-700 font-medium rounded-lg border border-red-200 hover:bg-red-50 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
        >
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Lưu PDF (Download)
        </button>
        <button 
            onClick={onReset}
            aria-label="Reset and grade another exam"
            className="w-full sm:flex-1 py-3 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/><path d="M3 5v7h7"/></svg>
            {isGraded ? "Chấm bài khác (Grade Another)" : "Quét bài khác (Scan Another)"}
        </button>
      </div>
    </div>
  );
};
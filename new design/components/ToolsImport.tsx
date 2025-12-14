import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  AlertCircle, 
  Check, 
  FileText, 
  X 
} from 'lucide-react';

const ToolsImport: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (file.name.endsWith('.csv')) {
      setSelectedFile(file);
    } else {
      alert('Пожалуйста, загрузите файл в формате CSV');
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    alert(`Загрузка файла ${selectedFile.name} началась...`);
    // Mock upload process
    setTimeout(() => {
        alert('Файл успешно обработан! Данные добавлены в очередь.');
        handleRemoveFile();
    }, 1500);
  };

  const handleDownloadTemplate = () => {
    alert('Скачивание шаблона import_template.csv...');
  };

  const tableStructure = [
    { col: 'A', name: 'ID клиента во внешней среде', desc: 'Опционально. Используйте для связи с CRM.', required: false },
    { col: 'B', name: 'Номер телефона', desc: 'Минимум 11 цифр, допускается произвольное форматирование.', required: true },
    { col: 'C', name: 'ФИО', desc: 'Опционально. Можно передать через пробелы или запятые.', required: false },
    { col: 'D', name: 'Дата рождения', desc: 'Опционально. Формат YYYY-MM-DD или DD.MM.YYYY.', required: false },
    { col: 'E', name: 'Количество баллов', desc: 'Если данных нет — поставьте 0.', required: true },
    { col: 'F', name: 'Всего покупок/сумма', desc: 'Опционально. Общая сумма чеков (LTV).', required: false },
    { col: 'G', name: 'Дата транзакции', desc: 'Если не заполнено — будет использована дата обработки файла.', required: false },
    { col: 'H', name: '№ чека', desc: 'Опционально.', required: false },
    { col: 'I', name: 'ID уровня', desc: 'Опционально.', required: false },
    { col: 'J', name: 'Email клиента', desc: 'Опционально.', required: false },
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Импорт данных</h2>
        <p className="text-gray-500 mt-1">Массовая загрузка клиентов и истории транзакций из внешних источников.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
         
         {/* Left Column: Actions */}
         <div className="xl:col-span-1 space-y-6">
            
            {/* Upload Zone */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
               <h3 className="font-bold text-gray-900 mb-4">Загрузка файла</h3>
               
               <div 
                  className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${
                     dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
               >
                  <input 
                     ref={inputRef}
                     type="file" 
                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                     onChange={handleChange}
                     accept=".csv"
                  />
                  
                  <div className="bg-blue-50 p-4 rounded-full mb-4">
                     <Upload size={32} className="text-blue-600" />
                  </div>
                  
                  <p className="text-sm font-medium text-gray-900 mb-1">
                     Перетащите файл сюда или нажмите для выбора
                  </p>
                  <p className="text-xs text-gray-500">
                     Поддерживается только формат CSV
                  </p>
               </div>

               {selectedFile && (
                  <div className="mt-4 p-3 bg-purple-50 border border-purple-100 rounded-lg flex items-center justify-between">
                     <div className="flex items-center space-x-3 overflow-hidden">
                        <FileSpreadsheet size={20} className="text-purple-600 flex-shrink-0" />
                        <span className="text-sm font-medium text-purple-900 truncate">{selectedFile.name}</span>
                     </div>
                     <button onClick={handleRemoveFile} className="text-purple-400 hover:text-purple-700 p-1">
                        <X size={16} />
                     </button>
                  </div>
               )}

               <button 
                  disabled={!selectedFile}
                  onClick={handleUpload}
                  className="w-full mt-4 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
               >
                  <span>Начать импорт</span>
               </button>
            </div>

            {/* Template Download */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
               <h3 className="font-bold text-gray-900 mb-2">Шаблон файла</h3>
               <p className="text-sm text-gray-500 mb-4">
                  Скачайте пример файла, чтобы правильно заполнить данные перед импортом.
               </p>
               <button 
                  onClick={handleDownloadTemplate}
                  className="w-full flex items-center justify-center space-x-2 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
               >
                  <Download size={16} />
                  <span>Скачать пример CSV</span>
               </button>
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start space-x-3">
               <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
               <div className="text-sm text-amber-800">
                  <span className="font-bold block mb-1">Важно</span>
                  Большие файлы (более 10,000 строк) могут обрабатываться несколько минут. Пожалуйста, не закрывайте вкладку до завершения загрузки.
               </div>
            </div>

         </div>

         {/* Right Column: Instructions */}
         <div className="xl:col-span-2 space-y-6">
            
            {/* Instructions */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
               <h3 className="font-bold text-gray-900 text-lg mb-4 flex items-center">
                  <FileText size={20} className="mr-2 text-gray-400" />
                  Инструкции по подготовке файла
               </h3>
               
               <ul className="space-y-3">
                  <li className="flex items-start space-x-3 text-sm text-gray-600">
                     <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                     <span>Формат файла — <strong>CSV</strong>. Кодировка <strong>UTF-8</strong>. Разделитель — <strong>точка с запятой (;)</strong>.</span>
                  </li>
                  <li className="flex items-start space-x-3 text-sm text-gray-600">
                     <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                     <span>Каждая строка соответствует одному клиенту. Используйте точку для разделения дробной части в числах.</span>
                  </li>
                  <li className="flex items-start space-x-3 text-sm text-gray-600">
                     <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                     <span>Перед загрузкой убедитесь, что обязательные колонки заполнены и в файле нет скрытых формул или форматирования.</span>
                  </li>
               </ul>
            </div>

            {/* Structure Table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
               <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-900">Структура файла</h3>
                  <p className="text-sm text-gray-500 mt-1">Описание колонок в порядке следования (A -&gt; J)</p>
               </div>
               
               <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                     <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                        <tr>
                           <th className="px-6 py-3 font-semibold w-16 text-center">Кол.</th>
                           <th className="px-6 py-3 font-semibold w-80">Поле</th>
                           <th className="px-6 py-3 font-semibold">Описание</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {tableStructure.map((row) => (
                           <tr key={row.col} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 text-center font-mono font-bold text-gray-400 bg-gray-50/30">
                                 {row.col}
                              </td>
                              <td className="px-6 py-4">
                                 <div className="flex items-center">
                                    <span className={`font-medium ${row.required ? 'text-gray-900' : 'text-gray-600'}`}>
                                       {row.name}
                                    </span>
                                    {row.required && (
                                       <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 whitespace-nowrap">
                                          Обязательно
                                       </span>
                                    )}
                                 </div>
                              </td>
                              <td className="px-6 py-4 text-gray-600">
                                 {row.desc}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>

         </div>
      </div>

    </div>
  );
};

export default ToolsImport;
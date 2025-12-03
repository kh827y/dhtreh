object Report1: TPDReport
  EngineVer = 1
  Width = 40
  IVars = <
    item
      Name = 'bonus_pay'
      TypeStr = 'integer'
    end
    item
      Name = 'data'
      TypeStr = 'string'
    end>
  UnionTables = <>
  RepParams = <>
  FixedHeight = 0
  TwoPasses = False
  object Document1: TPDDocument
    Height = 60
    object BandRepTitle: TPDBand
      Color = 13735574
      Top = 1
      Height = 2
      Header.Size = 2
      Body.Size = 0
      Footer.Size = 0
      BandType = btReportTitle
      CalcFields = <>
      object Memo1: TPDMemo
        Left = 0
        Top = 1
        Width = 40
        Height = 1
        Alignment = taCenter
        Content.Strings = (
          '[System.Restaurant.Name]')
      end
    end
    object bndPrintChecks: TPDBand
      Color = 11528431
      Top = 7
      Height = 6
      Body.Size = 5
      Footer.Size = 0
      BandType = btMasterData
      DataSetName = 'PrintChecks'
      CalcFields = <>
      object Memo4: TPDMemo
        Visible = False
        Left = 0
        Top = 4
        Width = 13
        Height = 1
        Content.Strings = (
          'Гостей [GuestCount]')
      end
      object memAuthor: TPDMemo
        Left = 10
        Top = 2
        Width = 22
        Height = 1
        Content.Strings = (
          '[Author]')
      end
      object Memo5: TPDMemo
        Left = 0
        Top = 2
        Width = 9
        Height = 2
        Content.Strings = (
          'Кассир:'
          'Официант:')
      end
      object Memo6: TPDMemo
        Left = 10
        Top = 3
        Width = 22
        Height = 1
        Content.Strings = (
          '[Orders.MainWaiter]')
      end
      object Memo16: TPDMemo
        Left = 0
        Top = 1
        Width = 12
        Height = 1
        Content.Strings = (
          '[Orders.StartService]')
        Format = 'Date'
      end
      object Memo19: TPDMemo
        Left = 12
        Top = 1
        Width = 14
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          'Открыт [Orders.StartService]')
        Format = 'Time'
      end
      object Memo21: TPDMemo
        Left = 26
        Top = 1
        Width = 14
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          'Печать [Now]')
        Format = 'Time'
      end
      object Memo11: TPDMemo
        Left = 16
        Top = 4
        Width = 1
        Height = 1
      end
    end
    object bndDiscounts: TPDBand
      Color = 16177339
      Top = 30
      Height = 4
      Body.Size = 2
      BandType = btMasterData
      Filter = 
        '{(*#ShortNotation#*)};begin;Filter := ([IsCharge] = 0) and ([Dis' +
        'hUNI]=0);end'
      DataSetName = 'Discounts'
      GroupFields = 'Discount'
      CalcFields = <>
      object memDiscount: TPDMemo
        Left = 0
        Top = 1
        Width = 21
        Height = 1
        Content.Strings = (
          '[Discount]')
      end
      object memCalcAmount: TPDMemo
        Left = 23
        Top = 1
        Width = 17
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[CalcAmount]')
      end
      object Memo17: TPDMemo
        Left = 0
        Top = 2
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
    end
    object bndBillPay: TPDBand
      Script.Strings = (
        'begin if [FullyPaid] then '
        '  memOrigionalSum1.Text := FloatToStr([OriginalSum])'
        'else '
        
          '  memOrigionalSum1.Text := '#39'------------ '#39' + FloatToStr([Origina' +
          'lSum]); end')
      Color = 11243120
      Top = 47
      Height = 3
      BandType = btMasterData
      SortKeys = 'CurrencyType;Currency'
      DataSetName = 'BillPay'
      CalcFields = <>
      object memCurrency2: TPDMemo
        Left = 0
        Top = 1
        Width = 16
        Height = 1
        Content.Strings = (
          '[Currency]')
      end
      object memOrigionalSum1: TPDMemo
        Left = 27
        Top = 1
        Width = 13
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[OriginalSum]')
        WordWrap = True
      end
      object Memo24: TPDMemo
        Left = 0
        Top = 2
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
    end
    object BandRepSum: TPDBand
      Color = 14547963
      Top = 50
      Height = 4
      Header.Size = 4
      Footer.Size = -1
      BandType = btReportSummary
      CalcFields = <>
      object Memo18: TPDMemo
        Left = 0
        Top = 1
        Width = 40
        Height = 2
        Alignment = taCenter
        Content.Strings = (
          'Вознаграждение официанту приветствуется'
          'но всегда остается на Ваше усмотрение.')
      end
    end
    object bndTaxes: TPDBand
      Color = 11243120
      Top = 33
      Height = 3
      Body.Size = 0
      Footer.Size = 2
      BandType = btMasterData
      Filter = '{(*#ShortNotation#*)};begin;Filter := ([AddToPrice] = 1);end'
      DataSetName = 'Taxes'
      CalcFields = <>
      object Memo20: TPDMemo
        Left = 0
        Top = 1
        Width = 19
        Height = 1
        Content.Strings = (
          'Добавляемый налог')
      end
      object memSum: TPDMemo
        Left = 22
        Top = 1
        Width = 18
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[SUM(Sum)]')
      end
      object Memo26: TPDMemo
        Left = 0
        Top = 2
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
    end
    object bndPayments: TPDBand
      Color = 11778427
      Top = 36
      Height = 4
      Header.Size = 2
      BandType = btMasterData
      Filter = 
        '{(*#ShortNotation#*)};begin;  Filter := ([IsPromisedPayment] = 0' +
        ');end'
      DataSetName = 'Payments'
      CalcFields = <>
      object Memo25: TPDMemo
        Left = 0
        Top = 1
        Width = 19
        Height = 1
        Content.Strings = (
          'Предоплата')
      end
      object memCurrency: TPDMemo
        Left = 0
        Top = 2
        Width = 21
        Height = 1
        Content.Strings = (
          '[Currency]')
      end
      object memOriginalSum: TPDMemo
        Script.Strings = (
          'begin memOriginalSum.Visible := [OriginalSum] <> [BasicSum]; end')
        Left = 21
        Top = 2
        Width = 8
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[OriginalSum]')
      end
      object memBasicSum: TPDMemo
        Left = 30
        Top = 2
        Width = 10
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[BasicSum]')
      end
      object Memo32: TPDMemo
        Left = 0
        Top = 3
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
    end
    object bndPrintChecks1: TPDBand
      Script.Strings = (
        'begin bndPrintChecks1.Visible := (Discounts.RecCount > 0)'
        '  or (Taxes.RecCount > 0)'
        '  or (Payments.RecCount > 0) end')
      Color = 9342606
      Top = 40
      Height = 7
      Body.Size = 6
      Footer.Size = 0
      BandType = btMasterData
      DataSetName = 'PrintChecks'
      CalcFields = <>
      object Memo30: TPDMemo
        Left = 0
        Top = 1
        Width = 19
        Height = 1
        Content.Strings = (
          'Итого к оплате:')
      end
      object memBindedSum2: TPDMemo
        Left = 21
        Top = 1
        Width = 19
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[BindedSum-PaidSum]')
      end
      object Memo31: TPDMemo
        Left = 0
        Top = 6
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
      object Memo10: TPDMemo
        Script.Strings = (
          
            'begin HTTPGet('#39'http://192.168.1.253:12012/print-info/'#39' + [Orders' +
            '.GUIDString], data);'
          'memo10.visible := data <> '#39'Order not found'#39';'
          'memo31.visible := memo10.visible; end')
        Left = 0
        Top = 3
        Width = 40
        Height = 3
        Content.Strings = (
          '[data]')
      end
      object Memo14: TPDMemo
        Left = 0
        Top = 2
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
    end
    object bndDishes: TPDBand
      Script.Strings = (
        'begin // Не печатаем модификаторы для комбо-блюда'
        'bndModifiers.Visible := [IsCombo] = 0;'
        '// Для комбо-компонентов прячем сумму'
        'memPRListSum.Visible := [ComboUNI] = 0; end')
      Color = 9876433
      Top = 13
      Height = 12
      Header.Size = 2
      Body.Size = 7
      Footer.Size = 3
      BandType = btMasterData
      DataSetName = 'Dishes'
      CalcFields = <>
      object Memo22: TPDMemo
        Left = 0
        Top = 1
        Width = 21
        Height = 1
        Content.Strings = (
          'Блюдо')
      end
      object Memo8: TPDMemo
        Left = 21
        Top = 1
        Width = 8
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          'Кол-во')
      end
      object Memo27: TPDMemo
        Left = 29
        Top = 1
        Width = 11
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          'Сумма')
      end
      object memQnt: TPDMemo
        Left = 21
        Top = 3
        Width = 8
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[Quantity]')
      end
      object memPRListSum: TPDMemo
        Left = 29
        Top = 3
        Width = 11
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[PRListSum]')
      end
      object memDishName1: TPDMemo
        Left = 0
        Top = 3
        Width = 21
        Height = 1
        Content.Strings = (
          '[DishName]')
        WordWrap = True
      end
      object Memo13: TPDMemo
        Left = 0
        Top = 9
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
      object Memo12: TPDMemo
        Left = 0
        Top = 10
        Width = 21
        Height = 1
        Content.Strings = (
          'Всего:')
      end
      object memPRListSum3: TPDMemo
        Left = 21
        Top = 10
        Width = 19
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          '[SUMIF(PRListSum;ComboUNI=0)]')
      end
      object Memo9: TPDMemo
        Left = 0
        Top = 11
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
      object Memo28: TPDMemo
        Script.Strings = (
          'begin Memo28.Visible := ([IsCombo] = 1) or ([RecNo] = 1); end')
        Left = 0
        Top = 2
        Width = 40
        Height = 1
        Content.Strings = (
          '--------------------------------------------')
      end
      object bndModifiers: TPDBand
        Color = 14277081
        Top = 4
        Height = 2
        Footer.Size = 0
        BandType = btMasterData
        DataSetName = 'Modifiers'
        GroupFields = 'ModiName'
        CalcFields = <>
        object memModiName: TPDMemo
          Script.Strings = (
            'var'
            '  PaidModiCnt : integer;'
            'begin'
            ''
            
              'if ([FreeModiCnt]<>[ModiCnt]) and (([Price]<0) or ([Price]>0)) t' +
              'hen begin'
            '  PaidModiCnt :=[ModiCnt]-[FreeModiCnt]; '
            '  if [Price]<0 then begin'
            
              '    MemModiName.Text := IntToStr(PaidModiCnt) + '#39'x '#39' + [ModiName' +
              '] +'#39'('#39'+FloatToStr([Price])+'#39')'#39
            '  end else'
            '    if [Price]>0 then'
            
              '      MemModiName.Text := IntToStr(PaidModiCnt) + '#39'x '#39' + [ModiNa' +
              'me] +'#39'(+'#39'+FloatToStr([Price])+'#39')'#39';'
            '  if [FreeModiCnt]>0 then '
            
              '    MemModiName.Text := MemModiName.Text + IntToStr([FreeModiCnt' +
              ']) + '#39'x '#39' + [ModiName];  '
            'end'
            'else if [ModiCnt] > 1 then'
            '  MemModiName.Text := IntToStr([ModiCnt]) + '#39'x '#39' + [ModiName];'
            'end')
          Left = 3
          Top = 1
          Width = 37
          Height = 1
          Content.Strings = (
            '[ModiName]')
        end
      end
      object bndDiscounts1: TPDBand
        Color = 11243120
        Top = 6
        Height = 2
        Footer.Size = 0
        BandType = btMasterData
        DataSetName = 'Discounts'
        CalcFields = <>
        object memDiscount1: TPDMemo
          Left = 3
          Top = 1
          Width = 26
          Height = 1
          Content.Strings = (
            '[Discount]')
        end
        object memCalcAmount1: TPDMemo
          Left = 29
          Top = 1
          Width = 11
          Height = 1
          Alignment = taRightJustify
          Content.Strings = (
            '[CalcAmount]')
        end
      end
    end
    object bndPrintChecks2: TPDBand
      Color = 16177339
      Top = 4
      Height = 3
      Body.Size = 2
      Footer.Size = 0
      BandType = btMasterData
      DataSetName = 'PrintChecks'
      CalcFields = <>
      object Memo2: TPDMemo
        Left = 0
        Top = 1
        Width = 12
        Height = 1
        Content.Strings = (
          'Чек #[CheckNum]')
      end
      object Memo3: TPDMemo
        Left = 14
        Top = 1
        Width = 12
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          'Стол # [Orders.TableName]')
      end
      object Memo15: TPDMemo
        Script.Strings = (
          'begin if [SeatNo] = 0 then '
          '  Memo15.Content.Text := Memo4.Content.Text'
          'else Memo15.Content.Text := '#39'Место [SeatNo]/[GuestCount]'#39'; end')
        Left = 26
        Top = 1
        Width = 14
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          'Место [SeatNo]/[GuestCount]')
      end
      object memBindedSum: TPDMemo
        Script.Strings = (
          'begin memBindedSum.Visible := [SeatNo] <> 0; end')
        Left = 10
        Top = 2
        Width = 31
        Height = 1
        Alignment = taRightJustify
        Content.Strings = (
          'Сумма [BindedSum]/[Orders.PaidSum]')
      end
    end
  end
end

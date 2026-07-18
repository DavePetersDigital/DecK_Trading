#property strict
#property indicator_chart_window
#property indicator_plots 0

enum TableDisplayMode
  {
   TABLE_HIDDEN = 0,
   TABLE_TEXT_ONLY = 1,
   TABLE_PANEL = 2
  };

input string General_Settings = "===== GENERAL =====";
input bool Show_Tokyo = true;
input bool Show_London = true;
input bool Show_New_York = true;
input int Daily_ATR_Period = 14;
input bool Show_ATR_Details = true;

input string Classification_Settings = "===== CLASSIFICATION =====";
input double Manipulation_Threshold_Percent = 20.0;
input double Strong_Threshold_Percent = 50.0;
input double Extreme_Threshold_Percent = 70.0;
input color Below_Threshold_Colour = clrDimGray;
input color Manipulation_Colour = clrDodgerBlue;
input color Strong_Manipulation_Colour = clrMediumPurple;
input color Extreme_Manipulation_Colour = clrDeepPink;

input string Session_Settings = "===== SESSION LOCAL TIMES =====";
input int Tokyo_Open_Hour = 9;
input int Tokyo_Open_Minute = 0;
input int Tokyo_Close_Hour = 15;
input int Tokyo_Close_Minute = 0;
input int Tokyo_Trading_Window_Minutes = 120;

input int London_Open_Hour = 8;
input int London_Open_Minute = 0;
input int London_Close_Hour = 17;
input int London_Close_Minute = 0;
input int London_Trading_Window_Minutes = 120;

input int New_York_Open_Hour = 9;
input int New_York_Open_Minute = 30;
input int New_York_Close_Hour = 17;
input int New_York_Close_Minute = 0;
input int New_York_Trading_Window_Minutes = 120;

input string Box_Display_Settings = "===== BOX DISPLAY =====";
input bool Show_Trading_Window_Box = true;
input bool Show_Full_Session_Box = false;
input bool Keep_Trading_Box_After_Window = false;
input bool Fill_Trading_Window_Box = true;
input bool Fill_Full_Session_Box = false;
input bool Draw_Full_Session_Box_Behind = true;
input bool Draw_Trading_Window_Box_Behind = true;
input ENUM_LINE_STYLE Trading_Box_Line_Style = STYLE_SOLID;
input ENUM_LINE_STYLE Full_Session_Box_Line_Style = STYLE_DASH;
input int Trading_Box_Line_Width = 1;
input int Full_Session_Box_Line_Width = 1;

input string Tokyo_Box_Colours = "===== TOKYO BOX COLOURS =====";
input color Tokyo_Trading_Box_Colour = clrMoccasin;
input color Tokyo_Full_Session_Box_Colour = clrDarkOrange;

input string London_Box_Colours = "===== LONDON BOX COLOURS =====";
input color London_Trading_Box_Colour = clrLightBlue;
input color London_Full_Session_Box_Colour = clrRoyalBlue;

input string New_York_Box_Colours = "===== NEW YORK BOX COLOURS =====";
input color New_York_Trading_Box_Colour = clrLavender;
input color New_York_Full_Session_Box_Colour = clrPurple;

input string Table_Settings = "===== TABLE / TEXT DISPLAY =====";
input TableDisplayMode Table_Display = TABLE_PANEL;
input ENUM_BASE_CORNER Table_Corner = CORNER_LEFT_UPPER;
input int Table_X = 10;
input int Table_Y = 20;
input int Table_Width = 235;
input int Table_Gap = 8;
input int Table_Font_Size = 9;
input int Table_Row_Height = 18;
input int Table_Padding = 8;
input color Table_Background = clrWhiteSmoke;
input color Table_Border = clrSilver;
input color Table_Text = clrBlack;
input color Table_Heading = clrBlack;

string PREFIX = "DP_ORB30_";
bool g_chartDirty = false;

//+------------------------------------------------------------------+
int OnInit()
  {
   IndicatorShortName("DP Opening Range v3.0");
   EventSetTimer(1);
   UpdateAll();
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   DeleteAllIndicatorObjects();
  }

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
  {
   // The timer owns live updates. Running the same drawing code on every tick
   // as well as every second caused visible flashing on active M15 charts.
   if(prev_calculated == 0)
      UpdateAll();

   return(rates_total);
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   UpdateAll();
  }

//+------------------------------------------------------------------+
void UpdateAll()
  {
   datetime utcNow = TimeGMT();
   int brokerOffset = (int)(TimeCurrent() - utcNow);

   double dailyATR = iATR(Symbol(), PERIOD_D1, Daily_ATR_Period, 1);
   if(dailyATR <= 0.0)
      return;

   bool visible[3];
   visible[0] = false;
   visible[1] = false;
   visible[2] = false;

   if(Show_Tokyo)
      visible[0] = ProcessSession("Tokyo", 0, utcNow, 9 * 3600, brokerOffset,
                                  Tokyo_Open_Hour, Tokyo_Open_Minute,
                                  Tokyo_Close_Hour, Tokyo_Close_Minute,
                                  Tokyo_Trading_Window_Minutes,
                                  dailyATR,
                                  Tokyo_Trading_Box_Colour,
                                  Tokyo_Full_Session_Box_Colour);
   else
      DeleteSessionObjects(0);

   if(Show_London)
     {
      int londonOffset = LondonUtcOffsetSeconds(utcNow);
      visible[1] = ProcessSession("London", 1, utcNow, londonOffset, brokerOffset,
                                  London_Open_Hour, London_Open_Minute,
                                  London_Close_Hour, London_Close_Minute,
                                  London_Trading_Window_Minutes,
                                  dailyATR,
                                  London_Trading_Box_Colour,
                                  London_Full_Session_Box_Colour);
     }
   else
      DeleteSessionObjects(1);

   if(Show_New_York)
     {
      int newYorkOffset = NewYorkUtcOffsetSeconds(utcNow);
      visible[2] = ProcessSession("New York", 2, utcNow, newYorkOffset, brokerOffset,
                                  New_York_Open_Hour, New_York_Open_Minute,
                                  New_York_Close_Hour, New_York_Close_Minute,
                                  New_York_Trading_Window_Minutes,
                                  dailyATR,
                                  New_York_Trading_Box_Colour,
                                  New_York_Full_Session_Box_Colour);
     }
   else
      DeleteSessionObjects(2);

   ArrangeTables(visible);

   if(g_chartDirty)
     {
      ChartRedraw(0);
      g_chartDirty = false;
     }
  }

//+------------------------------------------------------------------+
bool ProcessSession(string sessionName,
                    int sessionId,
                    datetime utcNow,
                    int cityUtcOffset,
                    int brokerUtcOffset,
                    int openHour,
                    int openMinute,
                    int closeHour,
                    int closeMinute,
                    int tradingWindowMinutes,
                    double dailyATR,
                    color tradingBoxColour,
                    color fullSessionBoxColour)
  {
   datetime cityNow = utcNow + cityUtcOffset;
   MqlDateTime cityDate;
   TimeToStruct(cityNow, cityDate);

   datetime openUtc = CityLocalToUtc(cityDate.year, cityDate.mon, cityDate.day,
                                     openHour, openMinute, cityUtcOffset);
   datetime closeUtc = CityLocalToUtc(cityDate.year, cityDate.mon, cityDate.day,
                                      closeHour, closeMinute, cityUtcOffset);

   if(closeUtc <= openUtc)
      closeUtc += 86400;

   datetime openBroker = openUtc + brokerUtcOffset;
   datetime openingCandleClose = openBroker + 15 * 60;
   datetime tradingWindowEnd = openBroker + MathMax(tradingWindowMinutes, 15) * 60;
   datetime sessionClose = closeUtc + brokerUtcOffset;
   datetime now = TimeCurrent();

   if(now >= sessionClose)
     {
      DeleteSessionObjects(sessionId);
      return(false);
     }

   if(now < openingCandleClose)
     {
      DeleteSessionObjects(sessionId);
      return(false);
     }

   int shift = iBarShift(Symbol(), PERIOD_M15, openBroker, true);
   if(shift < 0)
      shift = iBarShift(Symbol(), PERIOD_M15, openBroker, false);

   if(shift < 0)
     {
      DeleteSessionObjects(sessionId);
      return(false);
     }

   datetime actualBarTime = iTime(Symbol(), PERIOD_M15, shift);
   if(MathAbs((double)(actualBarTime - openBroker)) > 60.0)
     {
      DeleteSessionObjects(sessionId);
      return(false);
     }

   double barOpen = iOpen(Symbol(), PERIOD_M15, shift);
   double barHigh = iHigh(Symbol(), PERIOD_M15, shift);
   double barLow = iLow(Symbol(), PERIOD_M15, shift);
   double barClose = iClose(Symbol(), PERIOD_M15, shift);

   if(barHigh <= barLow)
      return(false);

   string base = PREFIX + IntegerToString(sessionId) + "_";

   if(Show_Full_Session_Box)
      CreateOrUpdateRectangle(base + "FULL_BOX",
                              openBroker, barHigh,
                              sessionClose, barLow,
                              fullSessionBoxColour,
                              Full_Session_Box_Line_Style,
                              Full_Session_Box_Line_Width,
                              Fill_Full_Session_Box,
                              Draw_Full_Session_Box_Behind);
   else
      DeleteObject(base + "FULL_BOX");

   bool tradingWindowActive = (now < tradingWindowEnd);
   bool showTradingBoxNow = Show_Trading_Window_Box &&
                            (tradingWindowActive || Keep_Trading_Box_After_Window);

   if(showTradingBoxNow)
      CreateOrUpdateRectangle(base + "TRADING_BOX",
                              openBroker, barHigh,
                              tradingWindowEnd, barLow,
                              tradingBoxColour,
                              Trading_Box_Line_Style,
                              Trading_Box_Line_Width,
                              Fill_Trading_Window_Box,
                              Draw_Trading_Window_Box_Behind);
   else
      DeleteObject(base + "TRADING_BOX");

   // The information table is relevant only during the configured trading window.
   if(Table_Display != TABLE_HIDDEN && tradingWindowActive)
     {
      double openingRange = barHigh - barLow;
      double atrPercent = (openingRange / dailyATR) * 100.0;
      bool bullish = (barClose > barOpen);
      bool bearish = (barClose < barOpen);

      string direction = bullish ? "Bullish" : (bearish ? "Bearish" : "Doji");
      string classification;
      color classificationColour;
      GetClassification(atrPercent, classification, classificationColour);

      UpdateTable(sessionId,
                  sessionName,
                  direction,
                  openingRange,
                  dailyATR,
                  atrPercent,
                  classification,
                  classificationColour,
                  tradingWindowEnd);
      return(true);
     }

   DeleteTable(sessionId);
   return(false);
  }

//+------------------------------------------------------------------+
void GetClassification(double atrPercent,
                       string &classification,
                       color &classificationColour)
  {
   if(atrPercent < Manipulation_Threshold_Percent)
     {
      classification = "NOT A MANIPULATION CANDLE";
      classificationColour = Below_Threshold_Colour;
     }
   else if(atrPercent < Strong_Threshold_Percent)
     {
      classification = "MANIPULATION";
      classificationColour = Manipulation_Colour;
     }
   else if(atrPercent < Extreme_Threshold_Percent)
     {
      classification = "STRONG MANIPULATION";
      classificationColour = Strong_Manipulation_Colour;
     }
   else
     {
      classification = "EXTREME MANIPULATION";
      classificationColour = Extreme_Manipulation_Colour;
     }
  }

//+------------------------------------------------------------------+
void CreateOrUpdateRectangle(string name,
                             datetime time1,
                             double price1,
                             datetime time2,
                             double price2,
                             color boxColour,
                             ENUM_LINE_STYLE lineStyle,
                             int lineWidth,
                             bool filled,
                             bool behindCandles)
  {
   bool created = false;

   if(ObjectFind(0, name) < 0)
     {
      if(!ObjectCreate(0, name, OBJ_RECTANGLE, 0, time1, price1, time2, price2))
         return;

      created = true;
     }

   if(created ||
      (datetime)ObjectGetInteger(0, name, OBJPROP_TIME1) != time1)
     {
      ObjectSetInteger(0, name, OBJPROP_TIME1, time1);
      g_chartDirty = true;
     }

   if(created ||
      MathAbs(ObjectGetDouble(0, name, OBJPROP_PRICE1) - price1) > Point * 0.1)
     {
      ObjectSetDouble(0, name, OBJPROP_PRICE1, price1);
      g_chartDirty = true;
     }

   if(created ||
      (datetime)ObjectGetInteger(0, name, OBJPROP_TIME2) != time2)
     {
      ObjectSetInteger(0, name, OBJPROP_TIME2, time2);
      g_chartDirty = true;
     }

   if(created ||
      MathAbs(ObjectGetDouble(0, name, OBJPROP_PRICE2) - price2) > Point * 0.1)
     {
      ObjectSetDouble(0, name, OBJPROP_PRICE2, price2);
      g_chartDirty = true;
     }

   if(created || (color)ObjectGetInteger(0, name, OBJPROP_COLOR) != boxColour)
     {
      ObjectSetInteger(0, name, OBJPROP_COLOR, boxColour);
      g_chartDirty = true;
     }

   if(created || (int)ObjectGetInteger(0, name, OBJPROP_STYLE) != (int)lineStyle)
     {
      ObjectSetInteger(0, name, OBJPROP_STYLE, lineStyle);
      g_chartDirty = true;
     }

   if(created || (int)ObjectGetInteger(0, name, OBJPROP_WIDTH) != lineWidth)
     {
      ObjectSetInteger(0, name, OBJPROP_WIDTH, lineWidth);
      g_chartDirty = true;
     }

   if(created || (bool)ObjectGetInteger(0, name, OBJPROP_FILL) != filled)
     {
      ObjectSetInteger(0, name, OBJPROP_FILL, filled);
      g_chartDirty = true;
     }

   if(created || (bool)ObjectGetInteger(0, name, OBJPROP_BACK) != behindCandles)
     {
      ObjectSetInteger(0, name, OBJPROP_BACK, behindCandles);
      g_chartDirty = true;
     }

   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

//+------------------------------------------------------------------+
void UpdateTable(int sessionId,
                 string sessionName,
                 string direction,
                 double openingRange,
                 double dailyATR,
                 double atrPercent,
                 string classification,
                 color classificationColour,
                 datetime tradingWindowEnd)
  {
   string base = PREFIX + IntegerToString(sessionId) + "_TABLE_";
   int rowCount = Show_ATR_Details ? 8 : 6;
   int panelHeight = Table_Padding * 2 + rowCount * Table_Row_Height;

   if(Table_Display == TABLE_PANEL)
      CreatePanel(base + "BG", panelHeight);
   else
      DeleteObject(base + "BG");

   CreateTableLabel(base + "TITLE", sessionName, Table_Heading, true);
   CreateTableLabel(base + "L1", "Direction: " + direction, Table_Text, false);
   CreateTableLabel(base + "L2", "Opening range: " +
                    DoubleToString(openingRange, Digits), Table_Text, false);

   int nextRow = 3;

   if(Show_ATR_Details)
     {
      CreateTableLabel(base + "L3", "Daily ATR: " +
                       DoubleToString(dailyATR, Digits), Table_Text, false);
      CreateTableLabel(base + "L4", "ATR used: " +
                       DoubleToString(atrPercent, 1) + "%",
                       classificationColour, false);
      CreateTableLabel(base + "L5", classification,
                       classificationColour, true);
      nextRow = 6;
     }
   else
     {
      DeleteObject(base + "L3");
      DeleteObject(base + "L4");
      CreateTableLabel(base + "L5", classification,
                       classificationColour, true);
      nextRow = 4;
     }

   int secondsRemaining = (int)(tradingWindowEnd - TimeCurrent());
   if(secondsRemaining < 0)
      secondsRemaining = 0;

   CreateTableLabel(base + "COUNT_LABEL",
                    "Trading window ends in:",
                    Table_Text,
                    false);
   CreateTableLabel(base + "COUNT_VALUE",
                    FormatCountdown(secondsRemaining),
                    classificationColour,
                    true);

   GlobalVariableSet(base + "COUNT_ROW", nextRow);
   GlobalVariableSet(base + "PANEL_HEIGHT", panelHeight);
  }

//+------------------------------------------------------------------+
void ArrangeTables(bool &visible[])
  {
   int slot = 0;

   for(int sessionId = 0; sessionId < 3; sessionId++)
     {
      if(visible[sessionId])
        {
         PositionTable(sessionId, slot);
         slot++;
        }
     }
  }

//+------------------------------------------------------------------+
void PositionTable(int sessionId, int slot)
  {
   string base = PREFIX + IntegerToString(sessionId) + "_TABLE_";
   int x = Table_X + slot * (Table_Width + Table_Gap);
   int y = Table_Y;
   int internalX = Table_Padding;

   if(IsRightCorner())
      x = Table_X + slot * (Table_Width + Table_Gap);

   PositionObject(base + "BG", x, y, false);

   PositionTableText(base + "TITLE", x, y, internalX, 0);
   PositionTableText(base + "L1", x, y, internalX, 1);
   PositionTableText(base + "L2", x, y, internalX, 2);

   int countRow = (int)GlobalVariableGet(base + "COUNT_ROW");

   if(Show_ATR_Details)
     {
      PositionTableText(base + "L3", x, y, internalX, 3);
      PositionTableText(base + "L4", x, y, internalX, 4);
      PositionTableText(base + "L5", x, y, internalX, 5);
     }
   else
      PositionTableText(base + "L5", x, y, internalX, 3);

   PositionTableText(base + "COUNT_LABEL", x, y, internalX, countRow);
   PositionTableText(base + "COUNT_VALUE", x, y, internalX, countRow + 1);
  }

//+------------------------------------------------------------------+
void CreatePanel(string name, int panelHeight)
  {
   bool created = false;

   if(ObjectFind(0, name) < 0)
     {
      if(!ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0))
         return;

      created = true;
     }

   if(created || (int)ObjectGetInteger(0, name, OBJPROP_CORNER) != (int)Table_Corner)
     {
      ObjectSetInteger(0, name, OBJPROP_CORNER, Table_Corner);
      g_chartDirty = true;
     }

   if(created || (int)ObjectGetInteger(0, name, OBJPROP_XSIZE) != Table_Width)
     {
      ObjectSetInteger(0, name, OBJPROP_XSIZE, Table_Width);
      g_chartDirty = true;
     }

   if(created || (int)ObjectGetInteger(0, name, OBJPROP_YSIZE) != panelHeight)
     {
      ObjectSetInteger(0, name, OBJPROP_YSIZE, panelHeight);
      g_chartDirty = true;
     }

   if(created || (color)ObjectGetInteger(0, name, OBJPROP_BGCOLOR) != Table_Background)
     {
      ObjectSetInteger(0, name, OBJPROP_BGCOLOR, Table_Background);
      g_chartDirty = true;
     }

   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, Table_Border);
   ObjectSetInteger(0, name, OBJPROP_COLOR, Table_Border);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

//+------------------------------------------------------------------+
void CreateTableLabel(string name,
                      string text,
                      color clr,
                      bool bold)
  {
   bool created = false;

   if(ObjectFind(0, name) < 0)
     {
      if(!ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0))
         return;

      created = true;
     }

   int wantedSize = bold ? Table_Font_Size + 1 : Table_Font_Size;
   string wantedFont = bold ? "Arial Bold" : "Arial";
   ENUM_ANCHOR_POINT wantedAnchor =
      IsLowerCorner() ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER;

   if(created || (int)ObjectGetInteger(0, name, OBJPROP_CORNER) != (int)Table_Corner)
     {
      ObjectSetInteger(0, name, OBJPROP_CORNER, Table_Corner);
      g_chartDirty = true;
     }

   if(created || (int)ObjectGetInteger(0, name, OBJPROP_ANCHOR) != (int)wantedAnchor)
     {
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, wantedAnchor);
      g_chartDirty = true;
     }

   if(created || (color)ObjectGetInteger(0, name, OBJPROP_COLOR) != clr)
     {
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      g_chartDirty = true;
     }

   if(created || (int)ObjectGetInteger(0, name, OBJPROP_FONTSIZE) != wantedSize)
     {
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, wantedSize);
      g_chartDirty = true;
     }

   if(created || ObjectGetString(0, name, OBJPROP_FONT) != wantedFont)
     {
      ObjectSetString(0, name, OBJPROP_FONT, wantedFont);
      g_chartDirty = true;
     }

   if(created || ObjectGetString(0, name, OBJPROP_TEXT) != text)
     {
      ObjectSetString(0, name, OBJPROP_TEXT, text);
      g_chartDirty = true;
     }

   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

//+------------------------------------------------------------------+
void PositionTableText(string name,
                       int panelX,
                       int panelY,
                       int internalX,
                       int row)
  {
   if(ObjectFind(0, name) < 0)
      return;

   int x = panelX + internalX;
   int y = panelY + Table_Padding + row * Table_Row_Height;

   if(IsRightCorner())
      x = panelX + Table_Width - internalX;

   if((int)ObjectGetInteger(0, name, OBJPROP_XDISTANCE) != x)
     {
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
      g_chartDirty = true;
     }

   if((int)ObjectGetInteger(0, name, OBJPROP_YDISTANCE) != y)
     {
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
      g_chartDirty = true;
     }
  }

//+------------------------------------------------------------------+
void PositionObject(string name, int x, int y, bool internal)
  {
   if(ObjectFind(0, name) < 0)
      return;

   if((int)ObjectGetInteger(0, name, OBJPROP_XDISTANCE) != x)
     {
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
      g_chartDirty = true;
     }

   if((int)ObjectGetInteger(0, name, OBJPROP_YDISTANCE) != y)
     {
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
      g_chartDirty = true;
     }
  }

//+------------------------------------------------------------------+
bool IsRightCorner()
  {
   return(Table_Corner == CORNER_RIGHT_UPPER ||
          Table_Corner == CORNER_RIGHT_LOWER);
  }

//+------------------------------------------------------------------+
bool IsLowerCorner()
  {
   return(Table_Corner == CORNER_LEFT_LOWER ||
          Table_Corner == CORNER_RIGHT_LOWER);
  }

//+------------------------------------------------------------------+
string FormatCountdown(int totalSeconds)
  {
   if(totalSeconds < 0)
      totalSeconds = 0;

   int hours = totalSeconds / 3600;
   int minutes = (totalSeconds % 3600) / 60;
   int seconds = totalSeconds % 60;

   return(StringFormat("%02d:%02d:%02d", hours, minutes, seconds));
  }

//+------------------------------------------------------------------+
datetime CityLocalToUtc(int year,
                        int month,
                        int day,
                        int hour,
                        int minute,
                        int cityUtcOffset)
  {
   MqlDateTime parts;
   ZeroMemory(parts);
   parts.year = year;
   parts.mon = month;
   parts.day = day;
   parts.hour = hour;
   parts.min = minute;
   return(StructToTime(parts) - cityUtcOffset);
  }

//+------------------------------------------------------------------+
int LondonUtcOffsetSeconds(datetime utc)
  {
   MqlDateTime dt;
   TimeToStruct(utc, dt);

   datetime start = LastSundayUtc(dt.year, 3, 1);
   datetime finish = LastSundayUtc(dt.year, 10, 1);

   return((utc >= start && utc < finish) ? 3600 : 0);
  }

//+------------------------------------------------------------------+
int NewYorkUtcOffsetSeconds(datetime utc)
  {
   MqlDateTime dt;
   TimeToStruct(utc, dt);

   datetime start = NthSundayUtc(dt.year, 3, 2, 7);
   datetime finish = NthSundayUtc(dt.year, 11, 1, 6);

   return((utc >= start && utc < finish)
          ? -4 * 3600
          : -5 * 3600);
  }

//+------------------------------------------------------------------+
datetime LastSundayUtc(int year, int month, int hour)
  {
   int nextMonth = month + 1;
   int nextYear = year;

   if(nextMonth == 13)
     {
      nextMonth = 1;
      nextYear++;
     }

   MqlDateTime d;
   ZeroMemory(d);
   d.year = nextYear;
   d.mon = nextMonth;
   d.day = 1;

   datetime firstNextMonth = StructToTime(d);
   datetime lastDay = firstNextMonth - 86400;

   MqlDateTime last;
   TimeToStruct(lastDay, last);

   return(lastDay - last.day_of_week * 86400 + hour * 3600);
  }

//+------------------------------------------------------------------+
datetime NthSundayUtc(int year, int month, int nth, int hour)
  {
   MqlDateTime d;
   ZeroMemory(d);
   d.year = year;
   d.mon = month;
   d.day = 1;

   datetime firstDay = StructToTime(d);

   MqlDateTime first;
   TimeToStruct(firstDay, first);

   int daysToSunday = (7 - first.day_of_week) % 7;

   return(firstDay + daysToSunday * 86400 +
          (nth - 1) * 7 * 86400 +
          hour * 3600);
  }

//+------------------------------------------------------------------+
void DeleteTable(int sessionId)
  {
   string base = PREFIX + IntegerToString(sessionId) + "_TABLE_";

   DeleteObject(base + "BG");
   DeleteObject(base + "TITLE");
   DeleteObject(base + "L1");
   DeleteObject(base + "L2");
   DeleteObject(base + "L3");
   DeleteObject(base + "L4");
   DeleteObject(base + "L5");
   DeleteObject(base + "COUNT_LABEL");
   DeleteObject(base + "COUNT_VALUE");

   GlobalVariableDel(base + "COUNT_ROW");
   GlobalVariableDel(base + "PANEL_HEIGHT");
  }

//+------------------------------------------------------------------+
void DeleteSessionObjects(int sessionId)
  {
   string base = PREFIX + IntegerToString(sessionId) + "_";

   DeleteObject(base + "FULL_BOX");
   DeleteObject(base + "TRADING_BOX");
   DeleteTable(sessionId);
  }

//+------------------------------------------------------------------+
void DeleteObject(string name)
  {
   if(ObjectFind(0, name) >= 0)
     {
      ObjectDelete(0, name);
      g_chartDirty = true;
     }
  }

//+------------------------------------------------------------------+
void DeleteAllIndicatorObjects()
  {
   int total = ObjectsTotal(0, 0, -1);

   for(int i = total - 1; i >= 0; i--)
     {
      string name = ObjectName(0, i, 0, -1);

      if(StringFind(name, PREFIX) == 0)
         ObjectDelete(0, name);
     }
  }
//+------------------------------------------------------------------+

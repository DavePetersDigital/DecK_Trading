import protobuf from 'protobufjs'

// Exact subset of Spotware's current Open API proto2 definitions required for
// application authentication, account/symbol discovery, and historical trend bars.
// Source: https://github.com/spotware/openapi-proto-messages
const schema = `
  syntax = "proto2";

  message ProtoMessage {
    required uint32 payloadType = 1;
    optional bytes payload = 2;
    optional string clientMsgId = 3;
  }

  enum ProtoPayloadType {
    PROTO_MESSAGE = 5;
    ERROR_RES = 50;
    HEARTBEAT_EVENT = 51;
  }

  message ProtoErrorRes {
    optional ProtoPayloadType payloadType = 1 [default = ERROR_RES];
    required string errorCode = 2;
    optional string description = 3;
    optional uint64 maintenanceEndTimestamp = 4;
  }

  enum ProtoOAPayloadType {
    PROTO_OA_APPLICATION_AUTH_REQ = 2100;
    PROTO_OA_APPLICATION_AUTH_RES = 2101;
    PROTO_OA_ACCOUNT_AUTH_REQ = 2102;
    PROTO_OA_ACCOUNT_AUTH_RES = 2103;
    PROTO_OA_VERSION_REQ = 2104;
    PROTO_OA_VERSION_RES = 2105;
    PROTO_OA_NEW_ORDER_REQ = 2106;
    PROTO_OA_TRAILING_SL_CHANGED_EVENT = 2107;
    PROTO_OA_CANCEL_ORDER_REQ = 2108;
    PROTO_OA_AMEND_ORDER_REQ = 2109;
    PROTO_OA_AMEND_POSITION_SLTP_REQ = 2110;
    PROTO_OA_CLOSE_POSITION_REQ = 2111;
    PROTO_OA_ASSET_LIST_REQ = 2112;
    PROTO_OA_ASSET_LIST_RES = 2113;
    PROTO_OA_SYMBOLS_LIST_REQ = 2114;
    PROTO_OA_SYMBOLS_LIST_RES = 2115;
    PROTO_OA_SYMBOL_BY_ID_REQ = 2116;
    PROTO_OA_SYMBOL_BY_ID_RES = 2117;
    PROTO_OA_SYMBOLS_FOR_CONVERSION_REQ = 2118;
    PROTO_OA_SYMBOLS_FOR_CONVERSION_RES = 2119;
    PROTO_OA_SYMBOL_CHANGED_EVENT = 2120;
    PROTO_OA_TRADER_REQ = 2121;
    PROTO_OA_TRADER_RES = 2122;
    PROTO_OA_TRADER_UPDATE_EVENT = 2123;
    PROTO_OA_RECONCILE_REQ = 2124;
    PROTO_OA_RECONCILE_RES = 2125;
    PROTO_OA_EXECUTION_EVENT = 2126;
    PROTO_OA_SUBSCRIBE_SPOTS_REQ = 2127;
    PROTO_OA_SUBSCRIBE_SPOTS_RES = 2128;
    PROTO_OA_UNSUBSCRIBE_SPOTS_REQ = 2129;
    PROTO_OA_UNSUBSCRIBE_SPOTS_RES = 2130;
    PROTO_OA_SPOT_EVENT = 2131;
    PROTO_OA_ORDER_ERROR_EVENT = 2132;
    PROTO_OA_DEAL_LIST_REQ = 2133;
    PROTO_OA_DEAL_LIST_RES = 2134;
    PROTO_OA_SUBSCRIBE_LIVE_TRENDBAR_REQ = 2135;
    PROTO_OA_UNSUBSCRIBE_LIVE_TRENDBAR_REQ = 2136;
    PROTO_OA_GET_TRENDBARS_REQ = 2137;
    PROTO_OA_GET_TRENDBARS_RES = 2138;
    PROTO_OA_EXPECTED_MARGIN_REQ = 2139;
    PROTO_OA_EXPECTED_MARGIN_RES = 2140;
    PROTO_OA_MARGIN_CHANGED_EVENT = 2141;
    PROTO_OA_ERROR_RES = 2142;
    PROTO_OA_CASH_FLOW_HISTORY_LIST_REQ = 2143;
    PROTO_OA_CASH_FLOW_HISTORY_LIST_RES = 2144;
    PROTO_OA_GET_TICKDATA_REQ = 2145;
    PROTO_OA_GET_TICKDATA_RES = 2146;
    PROTO_OA_ACCOUNTS_TOKEN_INVALIDATED_EVENT = 2147;
    PROTO_OA_CLIENT_DISCONNECT_EVENT = 2148;
    PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ = 2149;
    PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES = 2150;
    PROTO_OA_GET_CTID_PROFILE_BY_TOKEN_REQ = 2151;
    PROTO_OA_GET_CTID_PROFILE_BY_TOKEN_RES = 2152;
    PROTO_OA_ASSET_CLASS_LIST_REQ = 2153;
    PROTO_OA_ASSET_CLASS_LIST_RES = 2154;
    PROTO_OA_DEPTH_EVENT = 2155;
    PROTO_OA_SUBSCRIBE_DEPTH_QUOTES_REQ = 2156;
    PROTO_OA_SUBSCRIBE_DEPTH_QUOTES_RES = 2157;
    PROTO_OA_UNSUBSCRIBE_DEPTH_QUOTES_REQ = 2158;
    PROTO_OA_UNSUBSCRIBE_DEPTH_QUOTES_RES = 2159;
    PROTO_OA_SYMBOL_CATEGORY_REQ = 2160;
    PROTO_OA_SYMBOL_CATEGORY_RES = 2161;
    PROTO_OA_ACCOUNT_LOGOUT_REQ = 2162;
    PROTO_OA_ACCOUNT_LOGOUT_RES = 2163;
    PROTO_OA_ACCOUNT_DISCONNECT_EVENT = 2164;
    PROTO_OA_SUBSCRIBE_LIVE_TRENDBAR_RES = 2165;
    PROTO_OA_UNSUBSCRIBE_LIVE_TRENDBAR_RES = 2166;
    PROTO_OA_MARGIN_CALL_LIST_REQ = 2167;
    PROTO_OA_MARGIN_CALL_LIST_RES = 2168;
    PROTO_OA_MARGIN_CALL_UPDATE_REQ = 2169;
    PROTO_OA_MARGIN_CALL_UPDATE_RES = 2170;
    PROTO_OA_MARGIN_CALL_UPDATE_EVENT = 2171;
    PROTO_OA_MARGIN_CALL_TRIGGER_EVENT = 2172;
    PROTO_OA_REFRESH_TOKEN_REQ = 2173;
    PROTO_OA_REFRESH_TOKEN_RES = 2174;
    PROTO_OA_ORDER_LIST_REQ = 2175;
    PROTO_OA_ORDER_LIST_RES = 2176;
    PROTO_OA_GET_DYNAMIC_LEVERAGE_REQ = 2177;
    PROTO_OA_GET_DYNAMIC_LEVERAGE_RES = 2178;
    PROTO_OA_DEAL_LIST_BY_POSITION_ID_REQ = 2179;
    PROTO_OA_DEAL_LIST_BY_POSITION_ID_RES = 2180;
    PROTO_OA_ORDER_DETAILS_REQ = 2181;
    PROTO_OA_ORDER_DETAILS_RES = 2182;
    PROTO_OA_ORDER_LIST_BY_POSITION_ID_REQ = 2183;
    PROTO_OA_ORDER_LIST_BY_POSITION_ID_RES = 2184;
    PROTO_OA_DEAL_OFFSET_LIST_REQ = 2185;
    PROTO_OA_DEAL_OFFSET_LIST_RES = 2186;
    PROTO_OA_GET_POSITION_UNREALIZED_PNL_REQ = 2187;
    PROTO_OA_GET_POSITION_UNREALIZED_PNL_RES = 2188;
  }

  message ProtoOAApplicationAuthReq {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_APPLICATION_AUTH_REQ];
    required string clientId = 2;
    required string clientSecret = 3;
  }

  message ProtoOAApplicationAuthRes {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_APPLICATION_AUTH_RES];
  }

  message ProtoOAAccountAuthReq {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_ACCOUNT_AUTH_REQ];
    required int64 ctidTraderAccountId = 2;
    required string accessToken = 3;
  }

  message ProtoOAAccountAuthRes {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_ACCOUNT_AUTH_RES];
    required int64 ctidTraderAccountId = 2;
  }

  message ProtoOAErrorRes {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_ERROR_RES];
    optional int64 ctidTraderAccountId = 2;
    required string errorCode = 3;
    optional string description = 4;
    optional int64 maintenanceEndTimestamp = 5;
    optional uint64 retryAfter = 6;
  }

  message ProtoOAGetAccountListByAccessTokenReq {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ];
    required string accessToken = 2;
  }

  enum ProtoOAClientPermissionScope {
    SCOPE_VIEW = 0;
    SCOPE_TRADE = 1;
  }

  message ProtoOACtidTraderAccount {
    required uint64 ctidTraderAccountId = 1;
    optional bool isLive = 2;
    optional int64 traderLogin = 3;
    optional int64 lastClosingDealTimestamp = 4;
    optional int64 lastBalanceUpdateTimestamp = 5;
    optional string brokerTitleShort = 6;
  }

  message ProtoOAGetAccountListByAccessTokenRes {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES];
    required string accessToken = 2;
    optional ProtoOAClientPermissionScope permissionScope = 3;
    repeated ProtoOACtidTraderAccount ctidTraderAccount = 4;
  }

  message ProtoOASymbolsListReq {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_SYMBOLS_LIST_REQ];
    required int64 ctidTraderAccountId = 2;
    optional bool includeArchivedSymbols = 3 [default = false];
  }

  message ProtoOALightSymbol {
    required int64 symbolId = 1;
    optional string symbolName = 2;
    optional bool enabled = 3;
    optional int64 baseAssetId = 4;
    optional int64 quoteAssetId = 5;
    optional int64 symbolCategoryId = 6;
    optional string description = 7;
    optional double sortingNumber = 8;
  }

  message ProtoOAArchivedSymbol {
    required int64 symbolId = 1;
    required string name = 2;
    required int64 utcLastUpdateTimestamp = 3;
    optional string description = 4;
  }

  message ProtoOASymbolsListRes {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_SYMBOLS_LIST_RES];
    required int64 ctidTraderAccountId = 2;
    repeated ProtoOALightSymbol symbol = 3;
    repeated ProtoOAArchivedSymbol archivedSymbol = 4;
  }

  enum ProtoOATrendbarPeriod {
    M1 = 1;
    M2 = 2;
    M3 = 3;
    M4 = 4;
    M5 = 5;
    M10 = 6;
    M15 = 7;
    M30 = 8;
    H1 = 9;
    H4 = 10;
    H12 = 11;
    D1 = 12;
    W1 = 13;
    MN1 = 14;
  }

  message ProtoOATrendbar {
    required int64 volume = 3;
    optional ProtoOATrendbarPeriod period = 4 [default = M1];
    optional int64 low = 5;
    optional uint64 deltaOpen = 6;
    optional uint64 deltaClose = 7;
    optional uint64 deltaHigh = 8;
    optional uint32 utcTimestampInMinutes = 9;
  }

  message ProtoOAGetTrendbarsReq {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_GET_TRENDBARS_REQ];
    required int64 ctidTraderAccountId = 2;
    optional int64 fromTimestamp = 3;
    optional int64 toTimestamp = 4;
    required ProtoOATrendbarPeriod period = 5;
    required int64 symbolId = 6;
    optional uint32 count = 7;
  }

  message ProtoOAGetTrendbarsRes {
    optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_GET_TRENDBARS_RES];
    required int64 ctidTraderAccountId = 2;
    required ProtoOATrendbarPeriod period = 3;
    optional int64 timestamp = 4 [deprecated = true];
    repeated ProtoOATrendbar trendbar = 5;
    optional int64 symbolId = 6;
    optional bool hasMore = 7;
  }
`

const root = protobuf.parse(schema).root

export const cTraderProtocol = {
  message: root.lookupType('ProtoMessage'),
  commonError: root.lookupType('ProtoErrorRes'),
  applicationAuthRequest: root.lookupType('ProtoOAApplicationAuthReq'),
  applicationAuthResponse: root.lookupType('ProtoOAApplicationAuthRes'),
  accountAuthRequest: root.lookupType('ProtoOAAccountAuthReq'),
  accountAuthResponse: root.lookupType('ProtoOAAccountAuthRes'),
  openApiError: root.lookupType('ProtoOAErrorRes'),
  accountListRequest: root.lookupType('ProtoOAGetAccountListByAccessTokenReq'),
  accountListResponse: root.lookupType('ProtoOAGetAccountListByAccessTokenRes'),
  symbolsListRequest: root.lookupType('ProtoOASymbolsListReq'),
  symbolsListResponse: root.lookupType('ProtoOASymbolsListRes'),
  getTrendbarsRequest: root.lookupType('ProtoOAGetTrendbarsReq'),
  getTrendbarsResponse: root.lookupType('ProtoOAGetTrendbarsRes'),
} as const

export const cTraderPayloadType = {
  commonError: 50,
  heartbeat: 51,
  applicationAuthRequest: 2100,
  applicationAuthResponse: 2101,
  accountAuthRequest: 2102,
  accountAuthResponse: 2103,
  symbolsListRequest: 2114,
  symbolsListResponse: 2115,
  getTrendbarsRequest: 2137,
  getTrendbarsResponse: 2138,
  openApiError: 2142,
  accountListRequest: 2149,
  accountListResponse: 2150,
} as const

export const cTraderTrendbarPeriod = {
  M5: 5,
  M15: 7,
  H1: 9,
  H4: 10,
  D1: 12,
} as const

export type CTraderHistoryTimeframe = keyof typeof cTraderTrendbarPeriod

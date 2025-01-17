/* eslint-disable */

import { query as q } from 'faunadb'
import { EvalFqlError } from '../errors/EvalFqlError'

export function evalFQLCode(code: string) {
  return baseEvalFQL(code, q)
}

function baseEvalFQL(fql: string, q: any) {
  const {
    Ref,
    Bytes,
    Abort,
    At,
    Let,
    Var,
    If,
    Do,
    Object,
    Lambda,
    Call,
    Query,
    Map,
    Foreach,
    Filter,
    Take,
    Drop,
    Prepend,
    Append,
    IsEmpty,
    IsNonEmpty,
    Get,
    KeyFromSecret,
    Paginate,
    Exists,
    Create,
    Update,
    Replace,
    Delete,
    Insert,
    Remove,
    CreateClass,
    CreateCollection,
    CreateDatabase,
    CreateIndex,
    CreateKey,
    CreateFunction,
    CreateRole,
    Singleton,
    Events,
    Match,
    Union,
    Intersection,
    Difference,
    Distinct,
    Join,
    Login,
    Logout,
    Identify,
    Identity,
    HasIdentity,
    Concat,
    Casefold,
    FindStr,
    FindStrRegex,
    Length,
    LowerCase,
    LTrim,
    NGram,
    Repeat,
    ReplaceStr,
    ReplaceStrRegex,
    RTrim,
    Space,
    SubString,
    TitleCase,
    Trim,
    UpperCase,
    Time,
    Epoch,
    Date,
    NextId,
    NewId,
    Database,
    Index,
    Class,
    Collection,
    Function,
    Role,
    Classes,
    Collections,
    Databases,
    Indexes,
    Functions,
    Roles,
    Keys,
    Tokens,
    Credentials,
    Equals,
    Contains,
    Select,
    SelectAll,
    Abs,
    Add,
    BitAnd,
    BitNot,
    BitOr,
    BitXor,
    Ceil,
    Divide,
    Floor,
    Max,
    Min,
    Modulo,
    Multiply,
    Round,
    Subtract,
    Sign,
    Sqrt,
    Trunc,
    Acos,
    Asin,
    Atan,
    Cos,
    Cosh,
    Degrees,
    Exp,
    Hypot,
    Ln,
    Log,
    Pow,
    Radians,
    Sin,
    Sinh,
    Tan,
    Tanh,
    LT,
    LTE,
    GT,
    GTE,
    And,
    Or,
    Not,
    ToString,
    ToNumber,
    ToTime,
    ToSeconds,
    ToMicros,
    ToMillis,
    DayOfMonth,
    DayOfWeek,
    DayOfYear,
    Second,
    Minute,
    Hour,
    Month,
    Year,
    ToDate,
    Format,
    Merge,
    Range,
    Reduce,
    MoveDatabase,
    wrap,
    Count,
    Mean,
    Sum,
    StartsWith,
    EndsWith,
    ContainsStr,
    ContainsStrRegex,
    RegexEscape,
    Now,
    ToDouble,
    ToInteger,
    ToObject,
    ToArray,
    Any,
    All,
    TimeAdd,
    TimeSubtract,
    TimeDiff,
    IsNumber,
    IsDouble,
    IsInteger,
    IsBoolean,
    IsNull,
    IsBytes,
    IsTimestamp,
    IsDate,
    IsString,
    IsArray,
    IsObject,
    IsRef,
    IsSet,
    IsDoc,
    IsLambda,
    IsCollection,
    IsDatabase,
    IsIndex,
    IsFunction,
    IsKey,
    IsToken,
    IsCredentials,
    IsRole,
    Documents,
    Reverse,
    ContainsPath,
    ContainsField,
    ContainsValue,
    CreateAccessProvider,
    AccessProvider,
    AccessProviders,
    CurrentIdentity,
    HasCurrentIdentity,
    CurrentToken,
    HasCurrentToken,
  } = q

  // eslint-disable-next-line
  try {
    return fql.match(/^\s*{(.*\n*)*}\s*$/) ? eval(`(${fql})`) : eval(fql)
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new EvalFqlError(err, fql)
    }
    throw err
  }
}

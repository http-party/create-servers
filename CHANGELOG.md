# CHANGELOG

## 3.3.0

- Support `keepAliveTimeout`

## 3.2.1

- [#50] Fix bug where cert file reading errors do not surface

## 3.2.0

- [#37] Support HTTP2

## 3.1.0

- [#23], @DullReferenceException Support "*" for SNI host pattern

## 3.0.1

- [#22] Return value compatibility. Do no return `null` valued keys.

## 3.0.0

- [#21], @DullReferenceException Support creating multiple HTTP or HTTPS servers. 
  - [BREAKING] Introduces `async` functions. 

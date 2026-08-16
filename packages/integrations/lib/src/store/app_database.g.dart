// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $PlateLogTableTable extends PlateLogTable
    with TableInfo<$PlateLogTableTable, PlateLogTableData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PlateLogTableTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _loggedAtUtcMeta = const VerificationMeta(
    'loggedAtUtc',
  );
  @override
  late final GeneratedColumn<String> loggedAtUtc = GeneratedColumn<String>(
    'logged_at_utc',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, loggedAtUtc];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'plate_log_table';
  @override
  VerificationContext validateIntegrity(
    Insertable<PlateLogTableData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('logged_at_utc')) {
      context.handle(
        _loggedAtUtcMeta,
        loggedAtUtc.isAcceptableOrUnknown(
          data['logged_at_utc']!,
          _loggedAtUtcMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_loggedAtUtcMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PlateLogTableData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PlateLogTableData(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      loggedAtUtc: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}logged_at_utc'],
      )!,
    );
  }

  @override
  $PlateLogTableTable createAlias(String alias) {
    return $PlateLogTableTable(attachedDatabase, alias);
  }
}

class PlateLogTableData extends DataClass
    implements Insertable<PlateLogTableData> {
  final int id;

  /// UTC ISO-8601 — the authoritative moment of capture; rendered local
  /// by the UI. Stored as text so SQLite comparisons stay simple.
  final String loggedAtUtc;
  const PlateLogTableData({required this.id, required this.loggedAtUtc});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['logged_at_utc'] = Variable<String>(loggedAtUtc);
    return map;
  }

  PlateLogTableCompanion toCompanion(bool nullToAbsent) {
    return PlateLogTableCompanion(
      id: Value(id),
      loggedAtUtc: Value(loggedAtUtc),
    );
  }

  factory PlateLogTableData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PlateLogTableData(
      id: serializer.fromJson<int>(json['id']),
      loggedAtUtc: serializer.fromJson<String>(json['loggedAtUtc']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'loggedAtUtc': serializer.toJson<String>(loggedAtUtc),
    };
  }

  PlateLogTableData copyWith({int? id, String? loggedAtUtc}) =>
      PlateLogTableData(
        id: id ?? this.id,
        loggedAtUtc: loggedAtUtc ?? this.loggedAtUtc,
      );
  PlateLogTableData copyWithCompanion(PlateLogTableCompanion data) {
    return PlateLogTableData(
      id: data.id.present ? data.id.value : this.id,
      loggedAtUtc: data.loggedAtUtc.present
          ? data.loggedAtUtc.value
          : this.loggedAtUtc,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PlateLogTableData(')
          ..write('id: $id, ')
          ..write('loggedAtUtc: $loggedAtUtc')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, loggedAtUtc);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PlateLogTableData &&
          other.id == this.id &&
          other.loggedAtUtc == this.loggedAtUtc);
}

class PlateLogTableCompanion extends UpdateCompanion<PlateLogTableData> {
  final Value<int> id;
  final Value<String> loggedAtUtc;
  const PlateLogTableCompanion({
    this.id = const Value.absent(),
    this.loggedAtUtc = const Value.absent(),
  });
  PlateLogTableCompanion.insert({
    this.id = const Value.absent(),
    required String loggedAtUtc,
  }) : loggedAtUtc = Value(loggedAtUtc);
  static Insertable<PlateLogTableData> custom({
    Expression<int>? id,
    Expression<String>? loggedAtUtc,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (loggedAtUtc != null) 'logged_at_utc': loggedAtUtc,
    });
  }

  PlateLogTableCompanion copyWith({
    Value<int>? id,
    Value<String>? loggedAtUtc,
  }) {
    return PlateLogTableCompanion(
      id: id ?? this.id,
      loggedAtUtc: loggedAtUtc ?? this.loggedAtUtc,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (loggedAtUtc.present) {
      map['logged_at_utc'] = Variable<String>(loggedAtUtc.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PlateLogTableCompanion(')
          ..write('id: $id, ')
          ..write('loggedAtUtc: $loggedAtUtc')
          ..write(')'))
        .toString();
  }
}

class $FoodEntryTableTable extends FoodEntryTable
    with TableInfo<$FoodEntryTableTable, FoodEntryTableData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FoodEntryTableTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _plateLogIdMeta = const VerificationMeta(
    'plateLogId',
  );
  @override
  late final GeneratedColumn<int> plateLogId = GeneratedColumn<int>(
    'plate_log_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _databaseFoodSourceRefMeta =
      const VerificationMeta('databaseFoodSourceRef');
  @override
  late final GeneratedColumn<String> databaseFoodSourceRef =
      GeneratedColumn<String>(
        'database_food_source_ref',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _databaseFoodDisplayNameMeta =
      const VerificationMeta('databaseFoodDisplayName');
  @override
  late final GeneratedColumn<String> databaseFoodDisplayName =
      GeneratedColumn<String>(
        'database_food_display_name',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _databaseFoodSourceMeta =
      const VerificationMeta('databaseFoodSource');
  @override
  late final GeneratedColumn<String> databaseFoodSource =
      GeneratedColumn<String>(
        'database_food_source',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _quantityLowMeta = const VerificationMeta(
    'quantityLow',
  );
  @override
  late final GeneratedColumn<String> quantityLow = GeneratedColumn<String>(
    'quantity_low',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _quantityHighMeta = const VerificationMeta(
    'quantityHigh',
  );
  @override
  late final GeneratedColumn<String> quantityHigh = GeneratedColumn<String>(
    'quantity_high',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _quantityUnitMeta = const VerificationMeta(
    'quantityUnit',
  );
  @override
  late final GeneratedColumn<String> quantityUnit = GeneratedColumn<String>(
    'quantity_unit',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _quantityDisplayLabelMeta =
      const VerificationMeta('quantityDisplayLabel');
  @override
  late final GeneratedColumn<String> quantityDisplayLabel =
      GeneratedColumn<String>(
        'quantity_display_label',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    plateLogId,
    databaseFoodSourceRef,
    databaseFoodDisplayName,
    databaseFoodSource,
    quantityLow,
    quantityHigh,
    quantityUnit,
    quantityDisplayLabel,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'food_entry_table';
  @override
  VerificationContext validateIntegrity(
    Insertable<FoodEntryTableData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('plate_log_id')) {
      context.handle(
        _plateLogIdMeta,
        plateLogId.isAcceptableOrUnknown(
          data['plate_log_id']!,
          _plateLogIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_plateLogIdMeta);
    }
    if (data.containsKey('database_food_source_ref')) {
      context.handle(
        _databaseFoodSourceRefMeta,
        databaseFoodSourceRef.isAcceptableOrUnknown(
          data['database_food_source_ref']!,
          _databaseFoodSourceRefMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_databaseFoodSourceRefMeta);
    }
    if (data.containsKey('database_food_display_name')) {
      context.handle(
        _databaseFoodDisplayNameMeta,
        databaseFoodDisplayName.isAcceptableOrUnknown(
          data['database_food_display_name']!,
          _databaseFoodDisplayNameMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_databaseFoodDisplayNameMeta);
    }
    if (data.containsKey('database_food_source')) {
      context.handle(
        _databaseFoodSourceMeta,
        databaseFoodSource.isAcceptableOrUnknown(
          data['database_food_source']!,
          _databaseFoodSourceMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_databaseFoodSourceMeta);
    }
    if (data.containsKey('quantity_low')) {
      context.handle(
        _quantityLowMeta,
        quantityLow.isAcceptableOrUnknown(
          data['quantity_low']!,
          _quantityLowMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_quantityLowMeta);
    }
    if (data.containsKey('quantity_high')) {
      context.handle(
        _quantityHighMeta,
        quantityHigh.isAcceptableOrUnknown(
          data['quantity_high']!,
          _quantityHighMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_quantityHighMeta);
    }
    if (data.containsKey('quantity_unit')) {
      context.handle(
        _quantityUnitMeta,
        quantityUnit.isAcceptableOrUnknown(
          data['quantity_unit']!,
          _quantityUnitMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_quantityUnitMeta);
    }
    if (data.containsKey('quantity_display_label')) {
      context.handle(
        _quantityDisplayLabelMeta,
        quantityDisplayLabel.isAcceptableOrUnknown(
          data['quantity_display_label']!,
          _quantityDisplayLabelMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_quantityDisplayLabelMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  FoodEntryTableData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FoodEntryTableData(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      plateLogId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}plate_log_id'],
      )!,
      databaseFoodSourceRef: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}database_food_source_ref'],
      )!,
      databaseFoodDisplayName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}database_food_display_name'],
      )!,
      databaseFoodSource: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}database_food_source'],
      )!,
      quantityLow: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}quantity_low'],
      )!,
      quantityHigh: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}quantity_high'],
      )!,
      quantityUnit: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}quantity_unit'],
      )!,
      quantityDisplayLabel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}quantity_display_label'],
      )!,
    );
  }

  @override
  $FoodEntryTableTable createAlias(String alias) {
    return $FoodEntryTableTable(attachedDatabase, alias);
  }
}

class FoodEntryTableData extends DataClass
    implements Insertable<FoodEntryTableData> {
  final int id;

  /// Back-ref to the parent `PlateLogTable.id`. No DB-level FK is wired
  /// here — cascade rules belong to a later story when the schema grows.
  final int plateLogId;

  /// Denormalised `DatabaseFood`.
  final String databaseFoodSourceRef;
  final String databaseFoodDisplayName;
  final String databaseFoodSource;

  /// Denormalised `QuantityRange`. Numeric halves stored as text so the
  /// round-trip is verbatim — `0.5` comes back as `0.5`, not `0`.
  final String quantityLow;
  final String quantityHigh;
  final String quantityUnit;
  final String quantityDisplayLabel;
  const FoodEntryTableData({
    required this.id,
    required this.plateLogId,
    required this.databaseFoodSourceRef,
    required this.databaseFoodDisplayName,
    required this.databaseFoodSource,
    required this.quantityLow,
    required this.quantityHigh,
    required this.quantityUnit,
    required this.quantityDisplayLabel,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['plate_log_id'] = Variable<int>(plateLogId);
    map['database_food_source_ref'] = Variable<String>(databaseFoodSourceRef);
    map['database_food_display_name'] = Variable<String>(
      databaseFoodDisplayName,
    );
    map['database_food_source'] = Variable<String>(databaseFoodSource);
    map['quantity_low'] = Variable<String>(quantityLow);
    map['quantity_high'] = Variable<String>(quantityHigh);
    map['quantity_unit'] = Variable<String>(quantityUnit);
    map['quantity_display_label'] = Variable<String>(quantityDisplayLabel);
    return map;
  }

  FoodEntryTableCompanion toCompanion(bool nullToAbsent) {
    return FoodEntryTableCompanion(
      id: Value(id),
      plateLogId: Value(plateLogId),
      databaseFoodSourceRef: Value(databaseFoodSourceRef),
      databaseFoodDisplayName: Value(databaseFoodDisplayName),
      databaseFoodSource: Value(databaseFoodSource),
      quantityLow: Value(quantityLow),
      quantityHigh: Value(quantityHigh),
      quantityUnit: Value(quantityUnit),
      quantityDisplayLabel: Value(quantityDisplayLabel),
    );
  }

  factory FoodEntryTableData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FoodEntryTableData(
      id: serializer.fromJson<int>(json['id']),
      plateLogId: serializer.fromJson<int>(json['plateLogId']),
      databaseFoodSourceRef: serializer.fromJson<String>(
        json['databaseFoodSourceRef'],
      ),
      databaseFoodDisplayName: serializer.fromJson<String>(
        json['databaseFoodDisplayName'],
      ),
      databaseFoodSource: serializer.fromJson<String>(
        json['databaseFoodSource'],
      ),
      quantityLow: serializer.fromJson<String>(json['quantityLow']),
      quantityHigh: serializer.fromJson<String>(json['quantityHigh']),
      quantityUnit: serializer.fromJson<String>(json['quantityUnit']),
      quantityDisplayLabel: serializer.fromJson<String>(
        json['quantityDisplayLabel'],
      ),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'plateLogId': serializer.toJson<int>(plateLogId),
      'databaseFoodSourceRef': serializer.toJson<String>(databaseFoodSourceRef),
      'databaseFoodDisplayName': serializer.toJson<String>(
        databaseFoodDisplayName,
      ),
      'databaseFoodSource': serializer.toJson<String>(databaseFoodSource),
      'quantityLow': serializer.toJson<String>(quantityLow),
      'quantityHigh': serializer.toJson<String>(quantityHigh),
      'quantityUnit': serializer.toJson<String>(quantityUnit),
      'quantityDisplayLabel': serializer.toJson<String>(quantityDisplayLabel),
    };
  }

  FoodEntryTableData copyWith({
    int? id,
    int? plateLogId,
    String? databaseFoodSourceRef,
    String? databaseFoodDisplayName,
    String? databaseFoodSource,
    String? quantityLow,
    String? quantityHigh,
    String? quantityUnit,
    String? quantityDisplayLabel,
  }) => FoodEntryTableData(
    id: id ?? this.id,
    plateLogId: plateLogId ?? this.plateLogId,
    databaseFoodSourceRef: databaseFoodSourceRef ?? this.databaseFoodSourceRef,
    databaseFoodDisplayName:
        databaseFoodDisplayName ?? this.databaseFoodDisplayName,
    databaseFoodSource: databaseFoodSource ?? this.databaseFoodSource,
    quantityLow: quantityLow ?? this.quantityLow,
    quantityHigh: quantityHigh ?? this.quantityHigh,
    quantityUnit: quantityUnit ?? this.quantityUnit,
    quantityDisplayLabel: quantityDisplayLabel ?? this.quantityDisplayLabel,
  );
  FoodEntryTableData copyWithCompanion(FoodEntryTableCompanion data) {
    return FoodEntryTableData(
      id: data.id.present ? data.id.value : this.id,
      plateLogId: data.plateLogId.present
          ? data.plateLogId.value
          : this.plateLogId,
      databaseFoodSourceRef: data.databaseFoodSourceRef.present
          ? data.databaseFoodSourceRef.value
          : this.databaseFoodSourceRef,
      databaseFoodDisplayName: data.databaseFoodDisplayName.present
          ? data.databaseFoodDisplayName.value
          : this.databaseFoodDisplayName,
      databaseFoodSource: data.databaseFoodSource.present
          ? data.databaseFoodSource.value
          : this.databaseFoodSource,
      quantityLow: data.quantityLow.present
          ? data.quantityLow.value
          : this.quantityLow,
      quantityHigh: data.quantityHigh.present
          ? data.quantityHigh.value
          : this.quantityHigh,
      quantityUnit: data.quantityUnit.present
          ? data.quantityUnit.value
          : this.quantityUnit,
      quantityDisplayLabel: data.quantityDisplayLabel.present
          ? data.quantityDisplayLabel.value
          : this.quantityDisplayLabel,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FoodEntryTableData(')
          ..write('id: $id, ')
          ..write('plateLogId: $plateLogId, ')
          ..write('databaseFoodSourceRef: $databaseFoodSourceRef, ')
          ..write('databaseFoodDisplayName: $databaseFoodDisplayName, ')
          ..write('databaseFoodSource: $databaseFoodSource, ')
          ..write('quantityLow: $quantityLow, ')
          ..write('quantityHigh: $quantityHigh, ')
          ..write('quantityUnit: $quantityUnit, ')
          ..write('quantityDisplayLabel: $quantityDisplayLabel')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    plateLogId,
    databaseFoodSourceRef,
    databaseFoodDisplayName,
    databaseFoodSource,
    quantityLow,
    quantityHigh,
    quantityUnit,
    quantityDisplayLabel,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FoodEntryTableData &&
          other.id == this.id &&
          other.plateLogId == this.plateLogId &&
          other.databaseFoodSourceRef == this.databaseFoodSourceRef &&
          other.databaseFoodDisplayName == this.databaseFoodDisplayName &&
          other.databaseFoodSource == this.databaseFoodSource &&
          other.quantityLow == this.quantityLow &&
          other.quantityHigh == this.quantityHigh &&
          other.quantityUnit == this.quantityUnit &&
          other.quantityDisplayLabel == this.quantityDisplayLabel);
}

class FoodEntryTableCompanion extends UpdateCompanion<FoodEntryTableData> {
  final Value<int> id;
  final Value<int> plateLogId;
  final Value<String> databaseFoodSourceRef;
  final Value<String> databaseFoodDisplayName;
  final Value<String> databaseFoodSource;
  final Value<String> quantityLow;
  final Value<String> quantityHigh;
  final Value<String> quantityUnit;
  final Value<String> quantityDisplayLabel;
  const FoodEntryTableCompanion({
    this.id = const Value.absent(),
    this.plateLogId = const Value.absent(),
    this.databaseFoodSourceRef = const Value.absent(),
    this.databaseFoodDisplayName = const Value.absent(),
    this.databaseFoodSource = const Value.absent(),
    this.quantityLow = const Value.absent(),
    this.quantityHigh = const Value.absent(),
    this.quantityUnit = const Value.absent(),
    this.quantityDisplayLabel = const Value.absent(),
  });
  FoodEntryTableCompanion.insert({
    this.id = const Value.absent(),
    required int plateLogId,
    required String databaseFoodSourceRef,
    required String databaseFoodDisplayName,
    required String databaseFoodSource,
    required String quantityLow,
    required String quantityHigh,
    required String quantityUnit,
    required String quantityDisplayLabel,
  }) : plateLogId = Value(plateLogId),
       databaseFoodSourceRef = Value(databaseFoodSourceRef),
       databaseFoodDisplayName = Value(databaseFoodDisplayName),
       databaseFoodSource = Value(databaseFoodSource),
       quantityLow = Value(quantityLow),
       quantityHigh = Value(quantityHigh),
       quantityUnit = Value(quantityUnit),
       quantityDisplayLabel = Value(quantityDisplayLabel);
  static Insertable<FoodEntryTableData> custom({
    Expression<int>? id,
    Expression<int>? plateLogId,
    Expression<String>? databaseFoodSourceRef,
    Expression<String>? databaseFoodDisplayName,
    Expression<String>? databaseFoodSource,
    Expression<String>? quantityLow,
    Expression<String>? quantityHigh,
    Expression<String>? quantityUnit,
    Expression<String>? quantityDisplayLabel,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (plateLogId != null) 'plate_log_id': plateLogId,
      if (databaseFoodSourceRef != null)
        'database_food_source_ref': databaseFoodSourceRef,
      if (databaseFoodDisplayName != null)
        'database_food_display_name': databaseFoodDisplayName,
      if (databaseFoodSource != null)
        'database_food_source': databaseFoodSource,
      if (quantityLow != null) 'quantity_low': quantityLow,
      if (quantityHigh != null) 'quantity_high': quantityHigh,
      if (quantityUnit != null) 'quantity_unit': quantityUnit,
      if (quantityDisplayLabel != null)
        'quantity_display_label': quantityDisplayLabel,
    });
  }

  FoodEntryTableCompanion copyWith({
    Value<int>? id,
    Value<int>? plateLogId,
    Value<String>? databaseFoodSourceRef,
    Value<String>? databaseFoodDisplayName,
    Value<String>? databaseFoodSource,
    Value<String>? quantityLow,
    Value<String>? quantityHigh,
    Value<String>? quantityUnit,
    Value<String>? quantityDisplayLabel,
  }) {
    return FoodEntryTableCompanion(
      id: id ?? this.id,
      plateLogId: plateLogId ?? this.plateLogId,
      databaseFoodSourceRef:
          databaseFoodSourceRef ?? this.databaseFoodSourceRef,
      databaseFoodDisplayName:
          databaseFoodDisplayName ?? this.databaseFoodDisplayName,
      databaseFoodSource: databaseFoodSource ?? this.databaseFoodSource,
      quantityLow: quantityLow ?? this.quantityLow,
      quantityHigh: quantityHigh ?? this.quantityHigh,
      quantityUnit: quantityUnit ?? this.quantityUnit,
      quantityDisplayLabel: quantityDisplayLabel ?? this.quantityDisplayLabel,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (plateLogId.present) {
      map['plate_log_id'] = Variable<int>(plateLogId.value);
    }
    if (databaseFoodSourceRef.present) {
      map['database_food_source_ref'] = Variable<String>(
        databaseFoodSourceRef.value,
      );
    }
    if (databaseFoodDisplayName.present) {
      map['database_food_display_name'] = Variable<String>(
        databaseFoodDisplayName.value,
      );
    }
    if (databaseFoodSource.present) {
      map['database_food_source'] = Variable<String>(databaseFoodSource.value);
    }
    if (quantityLow.present) {
      map['quantity_low'] = Variable<String>(quantityLow.value);
    }
    if (quantityHigh.present) {
      map['quantity_high'] = Variable<String>(quantityHigh.value);
    }
    if (quantityUnit.present) {
      map['quantity_unit'] = Variable<String>(quantityUnit.value);
    }
    if (quantityDisplayLabel.present) {
      map['quantity_display_label'] = Variable<String>(
        quantityDisplayLabel.value,
      );
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FoodEntryTableCompanion(')
          ..write('id: $id, ')
          ..write('plateLogId: $plateLogId, ')
          ..write('databaseFoodSourceRef: $databaseFoodSourceRef, ')
          ..write('databaseFoodDisplayName: $databaseFoodDisplayName, ')
          ..write('databaseFoodSource: $databaseFoodSource, ')
          ..write('quantityLow: $quantityLow, ')
          ..write('quantityHigh: $quantityHigh, ')
          ..write('quantityUnit: $quantityUnit, ')
          ..write('quantityDisplayLabel: $quantityDisplayLabel')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $PlateLogTableTable plateLogTable = $PlateLogTableTable(this);
  late final $FoodEntryTableTable foodEntryTable = $FoodEntryTableTable(this);
  late final $CoachNoteTableTable coachNoteTable = $CoachNoteTableTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    plateLogTable,
    foodEntryTable,
    coachNoteTable,
  ];
}

class $CoachNoteTableTable extends CoachNoteTable
    with TableInfo<$CoachNoteTableTable, CoachNoteTableData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CoachNoteTableTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _plateLogIdMeta = const VerificationMeta(
    'plateLogId',
  );
  @override
  late final GeneratedColumn<int> plateLogId = GeneratedColumn<int>(
    'plate_log_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _anchorMeta =
      const VerificationMeta('anchor');
  @override
  late final GeneratedColumn<String> anchor = GeneratedColumn<String>(
    'anchor',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _questionKeyMeta =
      const VerificationMeta('questionKey');
  @override
  late final GeneratedColumn<String> questionKey = GeneratedColumn<String>(
    'question_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _noteTextMeta =
      const VerificationMeta('noteText');
  @override
  late final GeneratedColumn<String> noteText = GeneratedColumn<String>(
    'note_text',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _generatedAtMeta =
      const VerificationMeta('generatedAt');
  @override
  late final GeneratedColumn<String> generatedAt = GeneratedColumn<String>(
    'generated_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns =>
      [id, plateLogId, anchor, questionKey, noteText, generatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'coach_note_table';
  @override
  VerificationContext validateIntegrity(
    Insertable<CoachNoteTableData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('plate_log_id')) {
      context.handle(
        _plateLogIdMeta,
        plateLogId.isAcceptableOrUnknown(
          data['plate_log_id']!,
          _plateLogIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_plateLogIdMeta);
    }
    if (data.containsKey('anchor')) {
      context.handle(
        _anchorMeta,
        anchor.isAcceptableOrUnknown(data['anchor']!, _anchorMeta),
      );
    } else if (isInserting) {
      context.missing(_anchorMeta);
    }
    if (data.containsKey('question_key')) {
      context.handle(
        _questionKeyMeta,
        questionKey.isAcceptableOrUnknown(
          data['question_key']!,
          _questionKeyMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_questionKeyMeta);
    }
    if (data.containsKey('note_text')) {
      context.handle(
        _noteTextMeta,
        noteText.isAcceptableOrUnknown(data['note_text']!, _noteTextMeta),
      );
    } else if (isInserting) {
      context.missing(_noteTextMeta);
    }
    if (data.containsKey('generated_at')) {
      context.handle(
        _generatedAtMeta,
        generatedAt.isAcceptableOrUnknown(
          data['generated_at']!,
          _generatedAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_generatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CoachNoteTableData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CoachNoteTableData(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      plateLogId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}plate_log_id'],
      )!,
      anchor: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}anchor'],
      )!,
      questionKey: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}question_key'],
      )!,
      noteText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}note_text'],
      )!,
      generatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}generated_at'],
      )!,
    );
  }

  @override
  $CoachNoteTableTable createAlias(String alias) {
    return $CoachNoteTableTable(attachedDatabase, alias);
  }
}

class CoachNoteTableData extends DataClass
    implements Insertable<CoachNoteTableData> {
  final int id;

  /// FK to `plate_log_table.id`. Database-level constraint via
  /// `customConstraint` on the column declaration in
  /// `coach_note_table.dart`.
  final int plateLogId;

  /// Anchor enum, stored as text. Matches `CoachAnchor.name`.
  final String anchor;

  /// Reviewable key from the localized store.
  final String questionKey;

  /// Verbatim localized copy the whisper renders.
  final String noteText;

  /// UTC ISO-8601 — authoritative moment of generation; rendered
  /// local by the UI.
  final String generatedAt;
  const CoachNoteTableData({
    required this.id,
    required this.plateLogId,
    required this.anchor,
    required this.questionKey,
    required this.noteText,
    required this.generatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['plate_log_id'] = Variable<int>(plateLogId);
    map['anchor'] = Variable<String>(anchor);
    map['question_key'] = Variable<String>(questionKey);
    map['note_text'] = Variable<String>(noteText);
    map['generated_at'] = Variable<String>(generatedAt);
    return map;
  }

  CoachNoteTableCompanion toCompanion(bool nullToAbsent) {
    return CoachNoteTableCompanion(
      id: Value(id),
      plateLogId: Value(plateLogId),
      anchor: Value(anchor),
      questionKey: Value(questionKey),
      noteText: Value(noteText),
      generatedAt: Value(generatedAt),
    );
  }

  factory CoachNoteTableData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CoachNoteTableData(
      id: serializer.fromJson<int>(json['id']),
      plateLogId: serializer.fromJson<int>(json['plateLogId']),
      anchor: serializer.fromJson<String>(json['anchor']),
      questionKey: serializer.fromJson<String>(json['questionKey']),
      noteText: serializer.fromJson<String>(json['noteText']),
      generatedAt: serializer.fromJson<String>(json['generatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'plateLogId': serializer.toJson<int>(plateLogId),
      'anchor': serializer.toJson<String>(anchor),
      'questionKey': serializer.toJson<String>(questionKey),
      'noteText': serializer.toJson<String>(noteText),
      'generatedAt': serializer.toJson<String>(generatedAt),
    };
  }

  CoachNoteTableData copyWith({
    int? id,
    int? plateLogId,
    String? anchor,
    String? questionKey,
    String? noteText,
    String? generatedAt,
  }) => CoachNoteTableData(
    id: id ?? this.id,
    plateLogId: plateLogId ?? this.plateLogId,
    anchor: anchor ?? this.anchor,
    questionKey: questionKey ?? this.questionKey,
    noteText: noteText ?? this.noteText,
    generatedAt: generatedAt ?? this.generatedAt,
  );
  CoachNoteTableData copyWithCompanion(CoachNoteTableCompanion data) {
    return CoachNoteTableData(
      id: data.id.present ? data.id.value : this.id,
      plateLogId: data.plateLogId.present
          ? data.plateLogId.value
          : this.plateLogId,
      anchor: data.anchor.present ? data.anchor.value : this.anchor,
      questionKey: data.questionKey.present
          ? data.questionKey.value
          : this.questionKey,
      noteText: data.noteText.present ? data.noteText.value : this.noteText,
      generatedAt: data.generatedAt.present
          ? data.generatedAt.value
          : this.generatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CoachNoteTableData(')
          ..write('id: $id, ')
          ..write('plateLogId: $plateLogId, ')
          ..write('anchor: $anchor, ')
          ..write('questionKey: $questionKey, ')
          ..write('noteText: $noteText, ')
          ..write('generatedAt: $generatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    plateLogId,
    anchor,
    questionKey,
    noteText,
    generatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CoachNoteTableData &&
          other.id == this.id &&
          other.plateLogId == this.plateLogId &&
          other.anchor == this.anchor &&
          other.questionKey == this.questionKey &&
          other.noteText == this.noteText &&
          other.generatedAt == this.generatedAt);
}

class CoachNoteTableCompanion extends UpdateCompanion<CoachNoteTableData> {
  final Value<int> id;
  final Value<int> plateLogId;
  final Value<String> anchor;
  final Value<String> questionKey;
  final Value<String> noteText;
  final Value<String> generatedAt;
  const CoachNoteTableCompanion({
    this.id = const Value.absent(),
    this.plateLogId = const Value.absent(),
    this.anchor = const Value.absent(),
    this.questionKey = const Value.absent(),
    this.noteText = const Value.absent(),
    this.generatedAt = const Value.absent(),
  });
  CoachNoteTableCompanion.insert({
    this.id = const Value.absent(),
    required int plateLogId,
    required String anchor,
    required String questionKey,
    required String noteText,
    required String generatedAt,
  }) : plateLogId = Value(plateLogId),
       anchor = Value(anchor),
       questionKey = Value(questionKey),
       noteText = Value(noteText),
       generatedAt = Value(generatedAt);
  static Insertable<CoachNoteTableData> custom({
    Expression<int>? id,
    Expression<int>? plateLogId,
    Expression<String>? anchor,
    Expression<String>? questionKey,
    Expression<String>? noteText,
    Expression<String>? generatedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (plateLogId != null) 'plate_log_id': plateLogId,
      if (anchor != null) 'anchor': anchor,
      if (questionKey != null) 'question_key': questionKey,
      if (noteText != null) 'note_text': noteText,
      if (generatedAt != null) 'generated_at': generatedAt,
    });
  }

  CoachNoteTableCompanion copyWith({
    Value<int>? id,
    Value<int>? plateLogId,
    Value<String>? anchor,
    Value<String>? questionKey,
    Value<String>? noteText,
    Value<String>? generatedAt,
  }) {
    return CoachNoteTableCompanion(
      id: id ?? this.id,
      plateLogId: plateLogId ?? this.plateLogId,
      anchor: anchor ?? this.anchor,
      questionKey: questionKey ?? this.questionKey,
      noteText: noteText ?? this.noteText,
      generatedAt: generatedAt ?? this.generatedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (plateLogId.present) {
      map['plate_log_id'] = Variable<int>(plateLogId.value);
    }
    if (anchor.present) {
      map['anchor'] = Variable<String>(anchor.value);
    }
    if (questionKey.present) {
      map['question_key'] = Variable<String>(questionKey.value);
    }
    if (noteText.present) {
      map['note_text'] = Variable<String>(noteText.value);
    }
    if (generatedAt.present) {
      map['generated_at'] = Variable<String>(generatedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CoachNoteTableCompanion(')
          ..write('id: $id, ')
          ..write('plateLogId: $plateLogId, ')
          ..write('anchor: $anchor, ')
          ..write('questionKey: $questionKey, ')
          ..write('noteText: $noteText, ')
          ..write('generatedAt: $generatedAt')
          ..write(')'))
        .toString();
  }
}

typedef $$PlateLogTableTableCreateCompanionBuilder =
    PlateLogTableCompanion Function({
      Value<int> id,
      required String loggedAtUtc,
    });
typedef $$PlateLogTableTableUpdateCompanionBuilder =
    PlateLogTableCompanion Function({Value<int> id, Value<String> loggedAtUtc});

class $$PlateLogTableTableFilterComposer
    extends Composer<_$AppDatabase, $PlateLogTableTable> {
  $$PlateLogTableTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get loggedAtUtc => $composableBuilder(
    column: $table.loggedAtUtc,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PlateLogTableTableOrderingComposer
    extends Composer<_$AppDatabase, $PlateLogTableTable> {
  $$PlateLogTableTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get loggedAtUtc => $composableBuilder(
    column: $table.loggedAtUtc,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PlateLogTableTableAnnotationComposer
    extends Composer<_$AppDatabase, $PlateLogTableTable> {
  $$PlateLogTableTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get loggedAtUtc => $composableBuilder(
    column: $table.loggedAtUtc,
    builder: (column) => column,
  );
}

class $$PlateLogTableTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PlateLogTableTable,
          PlateLogTableData,
          $$PlateLogTableTableFilterComposer,
          $$PlateLogTableTableOrderingComposer,
          $$PlateLogTableTableAnnotationComposer,
          $$PlateLogTableTableCreateCompanionBuilder,
          $$PlateLogTableTableUpdateCompanionBuilder,
          (
            PlateLogTableData,
            BaseReferences<
              _$AppDatabase,
              $PlateLogTableTable,
              PlateLogTableData
            >,
          ),
          PlateLogTableData,
          PrefetchHooks Function()
        > {
  $$PlateLogTableTableTableManager(_$AppDatabase db, $PlateLogTableTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PlateLogTableTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PlateLogTableTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PlateLogTableTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> loggedAtUtc = const Value.absent(),
              }) => PlateLogTableCompanion(id: id, loggedAtUtc: loggedAtUtc),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String loggedAtUtc,
              }) => PlateLogTableCompanion.insert(
                id: id,
                loggedAtUtc: loggedAtUtc,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PlateLogTableTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PlateLogTableTable,
      PlateLogTableData,
      $$PlateLogTableTableFilterComposer,
      $$PlateLogTableTableOrderingComposer,
      $$PlateLogTableTableAnnotationComposer,
      $$PlateLogTableTableCreateCompanionBuilder,
      $$PlateLogTableTableUpdateCompanionBuilder,
      (
        PlateLogTableData,
        BaseReferences<_$AppDatabase, $PlateLogTableTable, PlateLogTableData>,
      ),
      PlateLogTableData,
      PrefetchHooks Function()
    >;
typedef $$FoodEntryTableTableCreateCompanionBuilder =
    FoodEntryTableCompanion Function({
      Value<int> id,
      required int plateLogId,
      required String databaseFoodSourceRef,
      required String databaseFoodDisplayName,
      required String databaseFoodSource,
      required String quantityLow,
      required String quantityHigh,
      required String quantityUnit,
      required String quantityDisplayLabel,
    });
typedef $$FoodEntryTableTableUpdateCompanionBuilder =
    FoodEntryTableCompanion Function({
      Value<int> id,
      Value<int> plateLogId,
      Value<String> databaseFoodSourceRef,
      Value<String> databaseFoodDisplayName,
      Value<String> databaseFoodSource,
      Value<String> quantityLow,
      Value<String> quantityHigh,
      Value<String> quantityUnit,
      Value<String> quantityDisplayLabel,
    });

class $$FoodEntryTableTableFilterComposer
    extends Composer<_$AppDatabase, $FoodEntryTableTable> {
  $$FoodEntryTableTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get plateLogId => $composableBuilder(
    column: $table.plateLogId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get databaseFoodSourceRef => $composableBuilder(
    column: $table.databaseFoodSourceRef,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get databaseFoodDisplayName => $composableBuilder(
    column: $table.databaseFoodDisplayName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get databaseFoodSource => $composableBuilder(
    column: $table.databaseFoodSource,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get quantityLow => $composableBuilder(
    column: $table.quantityLow,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get quantityHigh => $composableBuilder(
    column: $table.quantityHigh,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get quantityUnit => $composableBuilder(
    column: $table.quantityUnit,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get quantityDisplayLabel => $composableBuilder(
    column: $table.quantityDisplayLabel,
    builder: (column) => ColumnFilters(column),
  );
}

class $$FoodEntryTableTableOrderingComposer
    extends Composer<_$AppDatabase, $FoodEntryTableTable> {
  $$FoodEntryTableTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get plateLogId => $composableBuilder(
    column: $table.plateLogId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get databaseFoodSourceRef => $composableBuilder(
    column: $table.databaseFoodSourceRef,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get databaseFoodDisplayName => $composableBuilder(
    column: $table.databaseFoodDisplayName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get databaseFoodSource => $composableBuilder(
    column: $table.databaseFoodSource,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get quantityLow => $composableBuilder(
    column: $table.quantityLow,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get quantityHigh => $composableBuilder(
    column: $table.quantityHigh,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get quantityUnit => $composableBuilder(
    column: $table.quantityUnit,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get quantityDisplayLabel => $composableBuilder(
    column: $table.quantityDisplayLabel,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$FoodEntryTableTableAnnotationComposer
    extends Composer<_$AppDatabase, $FoodEntryTableTable> {
  $$FoodEntryTableTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<int> get plateLogId => $composableBuilder(
    column: $table.plateLogId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get databaseFoodSourceRef => $composableBuilder(
    column: $table.databaseFoodSourceRef,
    builder: (column) => column,
  );

  GeneratedColumn<String> get databaseFoodDisplayName => $composableBuilder(
    column: $table.databaseFoodDisplayName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get databaseFoodSource => $composableBuilder(
    column: $table.databaseFoodSource,
    builder: (column) => column,
  );

  GeneratedColumn<String> get quantityLow => $composableBuilder(
    column: $table.quantityLow,
    builder: (column) => column,
  );

  GeneratedColumn<String> get quantityHigh => $composableBuilder(
    column: $table.quantityHigh,
    builder: (column) => column,
  );

  GeneratedColumn<String> get quantityUnit => $composableBuilder(
    column: $table.quantityUnit,
    builder: (column) => column,
  );

  GeneratedColumn<String> get quantityDisplayLabel => $composableBuilder(
    column: $table.quantityDisplayLabel,
    builder: (column) => column,
  );
}

class $$FoodEntryTableTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $FoodEntryTableTable,
          FoodEntryTableData,
          $$FoodEntryTableTableFilterComposer,
          $$FoodEntryTableTableOrderingComposer,
          $$FoodEntryTableTableAnnotationComposer,
          $$FoodEntryTableTableCreateCompanionBuilder,
          $$FoodEntryTableTableUpdateCompanionBuilder,
          (
            FoodEntryTableData,
            BaseReferences<
              _$AppDatabase,
              $FoodEntryTableTable,
              FoodEntryTableData
            >,
          ),
          FoodEntryTableData,
          PrefetchHooks Function()
        > {
  $$FoodEntryTableTableTableManager(
    _$AppDatabase db,
    $FoodEntryTableTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FoodEntryTableTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FoodEntryTableTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FoodEntryTableTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> plateLogId = const Value.absent(),
                Value<String> databaseFoodSourceRef = const Value.absent(),
                Value<String> databaseFoodDisplayName = const Value.absent(),
                Value<String> databaseFoodSource = const Value.absent(),
                Value<String> quantityLow = const Value.absent(),
                Value<String> quantityHigh = const Value.absent(),
                Value<String> quantityUnit = const Value.absent(),
                Value<String> quantityDisplayLabel = const Value.absent(),
              }) => FoodEntryTableCompanion(
                id: id,
                plateLogId: plateLogId,
                databaseFoodSourceRef: databaseFoodSourceRef,
                databaseFoodDisplayName: databaseFoodDisplayName,
                databaseFoodSource: databaseFoodSource,
                quantityLow: quantityLow,
                quantityHigh: quantityHigh,
                quantityUnit: quantityUnit,
                quantityDisplayLabel: quantityDisplayLabel,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int plateLogId,
                required String databaseFoodSourceRef,
                required String databaseFoodDisplayName,
                required String databaseFoodSource,
                required String quantityLow,
                required String quantityHigh,
                required String quantityUnit,
                required String quantityDisplayLabel,
              }) => FoodEntryTableCompanion.insert(
                id: id,
                plateLogId: plateLogId,
                databaseFoodSourceRef: databaseFoodSourceRef,
                databaseFoodDisplayName: databaseFoodDisplayName,
                databaseFoodSource: databaseFoodSource,
                quantityLow: quantityLow,
                quantityHigh: quantityHigh,
                quantityUnit: quantityUnit,
                quantityDisplayLabel: quantityDisplayLabel,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$FoodEntryTableTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $FoodEntryTableTable,
      FoodEntryTableData,
      $$FoodEntryTableTableFilterComposer,
      $$FoodEntryTableTableOrderingComposer,
      $$FoodEntryTableTableAnnotationComposer,
      $$FoodEntryTableTableCreateCompanionBuilder,
      $$FoodEntryTableTableUpdateCompanionBuilder,
      (
        FoodEntryTableData,
        BaseReferences<_$AppDatabase, $FoodEntryTableTable, FoodEntryTableData>,
      ),
      FoodEntryTableData,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$PlateLogTableTableTableManager get plateLogTable =>
      $$PlateLogTableTableTableManager(_db, _db.plateLogTable);
  $$FoodEntryTableTableTableManager get foodEntryTable =>
      $$FoodEntryTableTableTableManager(_db, _db.foodEntryTable);
  $$CoachNoteTableTableTableManager get coachNoteTable =>
      $$CoachNoteTableTableTableManager(_db, _db.coachNoteTable);
}

typedef $$CoachNoteTableTableCreateCompanionBuilder =
    CoachNoteTableCompanion Function({
      Value<int> id,
      required int plateLogId,
      required String anchor,
      required String questionKey,
      required String noteText,
      required String generatedAt,
    });
typedef $$CoachNoteTableTableUpdateCompanionBuilder =
    CoachNoteTableCompanion Function({
      Value<int> id,
      Value<int> plateLogId,
      Value<String> anchor,
      Value<String> questionKey,
      Value<String> noteText,
      Value<String> generatedAt,
    });

class $$CoachNoteTableTableFilterComposer
    extends Composer<_$AppDatabase, $CoachNoteTableTable> {
  $$CoachNoteTableTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get plateLogId => $composableBuilder(
    column: $table.plateLogId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get anchor => $composableBuilder(
    column: $table.anchor,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get questionKey => $composableBuilder(
    column: $table.questionKey,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get noteText => $composableBuilder(
    column: $table.noteText,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get generatedAt => $composableBuilder(
    column: $table.generatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CoachNoteTableTableOrderingComposer
    extends Composer<_$AppDatabase, $CoachNoteTableTable> {
  $$CoachNoteTableTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get plateLogId => $composableBuilder(
    column: $table.plateLogId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get anchor => $composableBuilder(
    column: $table.anchor,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get questionKey => $composableBuilder(
    column: $table.questionKey,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get noteText => $composableBuilder(
    column: $table.noteText,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get generatedAt => $composableBuilder(
    column: $table.generatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CoachNoteTableTableAnnotationComposer
    extends Composer<_$AppDatabase, $CoachNoteTableTable> {
  $$CoachNoteTableTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<int> get plateLogId =>
      $composableBuilder(column: $table.plateLogId, builder: (column) => column);

  GeneratedColumn<String> get anchor =>
      $composableBuilder(column: $table.anchor, builder: (column) => column);

  GeneratedColumn<String> get questionKey => $composableBuilder(
    column: $table.questionKey,
    builder: (column) => column,
  );

  GeneratedColumn<String> get noteText =>
      $composableBuilder(column: $table.noteText, builder: (column) => column);

  GeneratedColumn<String> get generatedAt => $composableBuilder(
    column: $table.generatedAt,
    builder: (column) => column,
  );
}

class $$CoachNoteTableTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CoachNoteTableTable,
          CoachNoteTableData,
          $$CoachNoteTableTableFilterComposer,
          $$CoachNoteTableTableOrderingComposer,
          $$CoachNoteTableTableAnnotationComposer,
          $$CoachNoteTableTableCreateCompanionBuilder,
          $$CoachNoteTableTableUpdateCompanionBuilder,
          (
            CoachNoteTableData,
            BaseReferences<
              _$AppDatabase,
              $CoachNoteTableTable,
              CoachNoteTableData
            >,
          ),
          CoachNoteTableData,
          PrefetchHooks Function()
        > {
  $$CoachNoteTableTableTableManager(
    _$AppDatabase db,
    $CoachNoteTableTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CoachNoteTableTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CoachNoteTableTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CoachNoteTableTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> plateLogId = const Value.absent(),
                Value<String> anchor = const Value.absent(),
                Value<String> questionKey = const Value.absent(),
                Value<String> noteText = const Value.absent(),
                Value<String> generatedAt = const Value.absent(),
              }) => CoachNoteTableCompanion(
                id: id,
                plateLogId: plateLogId,
                anchor: anchor,
                questionKey: questionKey,
                noteText: noteText,
                generatedAt: generatedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int plateLogId,
                required String anchor,
                required String questionKey,
                required String noteText,
                required String generatedAt,
              }) => CoachNoteTableCompanion.insert(
                id: id,
                plateLogId: plateLogId,
                anchor: anchor,
                questionKey: questionKey,
                noteText: noteText,
                generatedAt: generatedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CoachNoteTableTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CoachNoteTableTable,
      CoachNoteTableData,
      $$CoachNoteTableTableFilterComposer,
      $$CoachNoteTableTableOrderingComposer,
      $$CoachNoteTableTableAnnotationComposer,
      $$CoachNoteTableTableCreateCompanionBuilder,
      $$CoachNoteTableTableUpdateCompanionBuilder,
      (
        CoachNoteTableData,
        BaseReferences<_$AppDatabase, $CoachNoteTableTable, CoachNoteTableData>,
      ),
      CoachNoteTableData,
      PrefetchHooks Function()
    >;

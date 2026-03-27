import { concat, flatten, isEmpty } from 'lodash-es';
import {
  hasWhiteSpace,
  hasWhiteSpaceOrUpperCase,
  shouldPrintSchema,
  buildJunctionFields1,
  buildJunctionFields2,
  buildNewTableName,
} from './utils';
import {
  isNumericType,
  isStringType,
  isBooleanType,
  isDateTimeType,
  isBinaryType,
} from '@dbml/parse';

// Snowflake built-in data types
// Reference: https://docs.snowflake.com/en/sql-reference/data-types
const SNOWFLAKE_BUILTIN_TYPES = [
  // Numeric types
  'NUMBER',
  'DECIMAL',
  'NUMERIC',
  'INT',
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  'BYTEINT',
  'FLOAT',
  'FLOAT4',
  'FLOAT8',
  'DOUBLE',
  'DOUBLE PRECISION',
  'REAL',

  // String types
  'VARCHAR',
  'CHAR',
  'CHARACTER',
  'STRING',
  'TEXT',
  'BINARY',
  'VARBINARY',

  // Boolean type
  'BOOLEAN',

  // Date/time types
  'DATE',
  'DATETIME',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMP_LTZ',
  'TIMESTAMP_NTZ',
  'TIMESTAMP_TZ',

  // Semi-structured types
  'VARIANT',
  'OBJECT',
  'ARRAY',

  // Geospatial types
  'GEOGRAPHY',
  'GEOMETRY',

  // Vector type
  'VECTOR',
];

class SnowflakeExporter {
  static exportRecords (model) {
    const records = Object.values(model.records || {});
    if (isEmpty(records)) {
      return [];
    }

    const insertStatements = records.map((record) => {
      const { schemaName, tableName, columns, values } = record;

      if (!values || values.length === 0) {
        return null;
      }

      const tableRef = schemaName ? `"${schemaName}"."${tableName}"` : `"${tableName}"`;

      const columnList = columns.length > 0
        ? `(${columns.map((col) => `"${col}"`).join(', ')})`
        : '';

      const formatValue = (val) => {
        if (val.value === null) return 'NULL';
        if (val.type === 'expression') return val.value;

        if (isNumericType(val.type)) return val.value;
        if (isBooleanType(val.type)) return String(val.value).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
        if (isStringType(val.type) || isDateTimeType(val.type) || isBinaryType(val.type)) return `'${String(val.value).replace(/'/g, "''")}'`;
        return `CAST('${String(val.value).replace(/'/g, "''")}'  AS ${val.type})`;
      };

      const valueRows = values.map((row) => {
        const valueStrs = row.map(formatValue);
        return `(${valueStrs.join(', ')})`;
      });

      const valuesClause = valueRows.join(',\n  ');

      return `INSERT INTO ${tableRef} ${columnList}\nVALUES\n  ${valuesClause};`;
    }).filter(Boolean);

    return insertStatements;
  }

  static getFieldLines (tableId, model) {
    const table = model.tables[tableId];

    const lines = table.fieldIds.map((fieldId) => {
      const field = model.fields[fieldId];
      const fieldName = `"${field.name}"`;

      let line = fieldName;

      // Snowflake has no native ENUM type - use VARCHAR with CHECK constraint
      if (field.enumId) {
        const _enum = model.enums[field.enumId];
        const enumValues = _enum.valueIds.map((valueId) => {
          const value = model.enumValues[valueId];
          return `'${value.name}'`;
        });
        const enumString = enumValues.join(', ');
        line += ` VARCHAR NOT NULL CHECK (${fieldName} IN (${enumString}))`;
      } else if (field.increment) {
        const typeRaw = field.type.type_name.toUpperCase();
        const integerTypes = new Set(['BIGINT', 'INT', 'INTEGER', 'SMALLINT', 'TINYINT', 'BYTEINT', 'NUMBER']);
        const type = integerTypes.has(typeRaw) ? typeRaw : 'INT';
        line += ` ${type} AUTOINCREMENT`;
      } else {
        const originalTypeName = field.type.type_name;
        const upperCaseTypeName = originalTypeName.toUpperCase();

        const shouldDoubleQuote = !SNOWFLAKE_BUILTIN_TYPES.includes(upperCaseTypeName)
          && hasWhiteSpaceOrUpperCase(originalTypeName);

        const typeName = shouldDoubleQuote ? `"${originalTypeName}"` : originalTypeName;
        line += ` ${typeName}`;
      }

      if (field.unique) {
        line += ' UNIQUE';
      }
      if (field.pk) {
        line += ' PRIMARY KEY';
      }
      if (field.not_null && !field.enumId) {
        line += ' NOT NULL';
      }
      if (field.checkIds && field.checkIds.length > 0) {
        if (field.checkIds.length === 1) {
          const check = model.checks[field.checkIds[0]];
          if (check.name) {
            line += ` CONSTRAINT "${check.name}"`;
          }
          line += ` CHECK (${check.expression})`;
        } else {
          const checkExpressions = field.checkIds.map((checkId) => {
            const check = model.checks[checkId];
            return `(${check.expression})`;
          });
          line += ` CHECK (${checkExpressions.join(' AND ')})`;
        }
      }
      if (field.dbdefault) {
        const isNullDefault = field.dbdefault.type === 'boolean' && (
          field.dbdefault.value === null
          || (typeof field.dbdefault.value === 'string' && field.dbdefault.value.toLowerCase() === 'null')
        );

        if (!isNullDefault) {
          if (field.dbdefault.type === 'expression') {
            line += ` DEFAULT (${field.dbdefault.value})`;
          } else if (field.dbdefault.type === 'string') {
            line += ` DEFAULT '${field.dbdefault.value}'`;
          } else {
            line += ` DEFAULT ${field.dbdefault.value}`;
          }
        }
      }

      return line;
    });

    return lines;
  }

  static getCompositePKs (tableId, model) {
    const table = model.tables[tableId];

    const compositePkIds = table.indexIds ? table.indexIds.filter((indexId) => model.indexes[indexId].pk) : [];
    const lines = compositePkIds.map((keyId) => {
      const key = model.indexes[keyId];
      let line = 'PRIMARY KEY';
      const columnArr = [];

      key.columnIds.forEach((columnId) => {
        const column = model.indexColumns[columnId];
        let columnStr = '';
        if (column.type === 'expression') {
          columnStr = `(${column.value})`;
        } else {
          columnStr = `"${column.value}"`;
        }
        columnArr.push(columnStr);
      });

      line += ` (${columnArr.join(', ')})`;

      return line;
    });

    return lines;
  }

  static getCheckLines (tableId, model) {
    const table = model.tables[tableId];

    if (!table.checkIds || table.checkIds.length === 0) {
      return [];
    }

    const lines = table.checkIds.map((checkId) => {
      const check = model.checks[checkId];
      let line = '';

      if (check.name) {
        line = `CONSTRAINT "${check.name}" `;
      }

      line += `CHECK (${check.expression})`;

      return line;
    });

    return lines;
  }

  static getTableContentArr (tableIds, model) {
    const tableContentArr = tableIds.map((tableId) => {
      const fieldContents = SnowflakeExporter.getFieldLines(tableId, model);
      const checkContents = SnowflakeExporter.getCheckLines(tableId, model);
      const compositePKs = SnowflakeExporter.getCompositePKs(tableId, model);

      return {
        tableId,
        fieldContents,
        checkContents,
        compositePKs,
      };
    });

    return tableContentArr;
  }

  static exportTables (tableIds, model) {
    const tableContentArr = SnowflakeExporter.getTableContentArr(tableIds, model);

    const tableStrs = tableContentArr.map((tableContent) => {
      const content = [...tableContent.fieldContents, ...tableContent.checkContents, ...tableContent.compositePKs];
      const table = model.tables[tableContent.tableId];
      const schema = model.schemas[table.schemaId];
      const tableStr = `CREATE TABLE ${shouldPrintSchema(schema, model)
        ? `"${schema.name}".`
        : ''}"${table.name}" (\n${content.map((line) => `  ${line}`).join(',\n')}\n);\n`;
      return tableStr;
    });

    return tableStrs;
  }

  static buildFieldName (fieldIds, model) {
    const fieldNames = fieldIds.map((fieldId) => `"${model.fields[fieldId].name}"`).join(', ');
    return `(${fieldNames})`;
  }

  static buildTableManyToMany (firstTableFieldsMap, secondTableFieldsMap, tableName, refEndpointSchema, model) {
    let line = `CREATE TABLE ${shouldPrintSchema(refEndpointSchema, model)
      ? `"${refEndpointSchema.name}".`
      : ''}"${tableName}" (\n`;
    const key1s = [...firstTableFieldsMap.keys()].join('", "');
    const key2s = [...secondTableFieldsMap.keys()].join('", "');
    firstTableFieldsMap.forEach((fieldType, fieldName) => {
      line += `  "${fieldName}" ${fieldType},\n`;
    });
    secondTableFieldsMap.forEach((fieldType, fieldName) => {
      line += `  "${fieldName}" ${fieldType},\n`;
    });
    line += `  PRIMARY KEY ("${key1s}", "${key2s}")\n`;
    line += ');\n\n';
    return line;
  }

  static buildForeignKeyManyToMany (fieldsMap, foreignEndpointFields, refEndpointTableName, foreignEndpointTableName, refEndpointSchema, foreignEndpointSchema, model) {
    const refEndpointFields = [...fieldsMap.keys()].join('", "');
    const line = `ALTER TABLE ${shouldPrintSchema(refEndpointSchema, model)
      ? `"${refEndpointSchema.name}".`
      : ''}"${refEndpointTableName}" ADD FOREIGN KEY ("${refEndpointFields}") REFERENCES ${shouldPrintSchema(foreignEndpointSchema, model)
      ? `"${foreignEndpointSchema.name}".`
      : ''}"${foreignEndpointTableName}" ${foreignEndpointFields};\n\n`;
    return line;
  }

  static exportRefs (refIds, model, usedTableNames) {
    const strArr = refIds.map((refId) => {
      let line = '';
      const ref = model.refs[refId];
      const refOneIndex = ref.endpointIds.findIndex((endpointId) => model.endpoints[endpointId].relation === '1');
      const refEndpointIndex = refOneIndex === -1 ? 0 : refOneIndex;
      const foreignEndpointId = ref.endpointIds[1 - refEndpointIndex];
      const refEndpointId = ref.endpointIds[refEndpointIndex];
      const foreignEndpoint = model.endpoints[foreignEndpointId];
      const refEndpoint = model.endpoints[refEndpointId];

      const refEndpointField = model.fields[refEndpoint.fieldIds[0]];
      const refEndpointTable = model.tables[refEndpointField.tableId];
      const refEndpointSchema = model.schemas[refEndpointTable.schemaId];
      const refEndpointFieldName = this.buildFieldName(refEndpoint.fieldIds, model);

      const foreignEndpointField = model.fields[foreignEndpoint.fieldIds[0]];
      const foreignEndpointTable = model.tables[foreignEndpointField.tableId];
      const foreignEndpointSchema = model.schemas[foreignEndpointTable.schemaId];
      const foreignEndpointFieldName = this.buildFieldName(foreignEndpoint.fieldIds, model);

      if (refOneIndex === -1) { // many to many relationship
        const firstTableFieldsMap = buildJunctionFields1(refEndpoint.fieldIds, model);
        const secondTableFieldsMap = buildJunctionFields2(foreignEndpoint.fieldIds, model, firstTableFieldsMap);

        const newTableName = buildNewTableName(refEndpointTable.name, foreignEndpointTable.name, usedTableNames);
        line += this.buildTableManyToMany(firstTableFieldsMap, secondTableFieldsMap, newTableName, refEndpointSchema, model);

        line += this.buildForeignKeyManyToMany(firstTableFieldsMap, refEndpointFieldName, newTableName, refEndpointTable.name, refEndpointSchema, refEndpointSchema, model);
        line += this.buildForeignKeyManyToMany(secondTableFieldsMap, foreignEndpointFieldName, newTableName, foreignEndpointTable.name, refEndpointSchema, foreignEndpointSchema, model);
      } else {
        line = `ALTER TABLE ${shouldPrintSchema(foreignEndpointSchema, model)
          ? `"${foreignEndpointSchema.name}".`
          : ''}"${foreignEndpointTable.name}" ADD `;
        if (ref.name) {
          line += `CONSTRAINT "${ref.name}" `;
        }
        line += `FOREIGN KEY ${foreignEndpointFieldName} REFERENCES ${shouldPrintSchema(refEndpointSchema, model)
          ? `"${refEndpointSchema.name}".`
          : ''}"${refEndpointTable.name}" ${refEndpointFieldName}`;
        if (ref.onDelete) {
          line += ` ON DELETE ${ref.onDelete.toUpperCase()}`;
        }
        if (ref.onUpdate) {
          line += ` ON UPDATE ${ref.onUpdate.toUpperCase()}`;
        }
        line += ';\n';
      }
      return line;
    });

    return strArr;
  }

  static exportComments (comments, model) {
    const commentArr = comments.map((comment) => {
      let line = 'COMMENT ON';
      const table = model.tables[comment.tableId];
      const schema = model.schemas[table.schemaId];
      switch (comment.type) {
        case 'table': {
          line += ` TABLE ${shouldPrintSchema(schema, model)
            ? `"${schema.name}".`
            : ''}"${table.name}" IS '${table.note.replace(/'/g, '\'\'')}'`;
          break;
        }
        case 'column': {
          const field = model.fields[comment.fieldId];
          line += ` COLUMN ${shouldPrintSchema(schema, model)
            ? `"${schema.name}".`
            : ''}"${table.name}"."${field.name}" IS '${field.note.replace(/'/g, '\'\'')}'`;
          break;
        }
        default:
          break;
      }

      line += ';\n';

      return line;
    });

    return commentArr;
  }

  static export (model) {
    const database = model.database['1'];

    const usedTableNames = new Set(Object.values(model.tables).map((table) => table.name));

    const statements = database.schemaIds.reduce((prevStatements, schemaId) => {
      const schema = model.schemas[schemaId];
      const { tableIds, refIds } = schema;

      if (shouldPrintSchema(schema, model)) {
        prevStatements.schemas.push(`CREATE SCHEMA "${schema.name}";\n`);
      }

      if (!isEmpty(tableIds)) {
        prevStatements.tables.push(...SnowflakeExporter.exportTables(tableIds, model));
      }

      const commentNodes = flatten(tableIds.map((tableId) => {
        const { fieldIds, note } = model.tables[tableId];
        const fieldObjects = fieldIds
          .filter((fieldId) => model.fields[fieldId].note)
          .map((fieldId) => ({ type: 'column', fieldId, tableId }));
        return note ? [{ type: 'table', tableId }].concat(fieldObjects) : fieldObjects;
      }));
      if (!isEmpty(commentNodes)) {
        prevStatements.comments.push(...SnowflakeExporter.exportComments(commentNodes, model));
      }

      if (!isEmpty(refIds)) {
        prevStatements.refs.push(...SnowflakeExporter.exportRefs(refIds, model, usedTableNames));
      }

      return prevStatements;
    }, {
      schemas: [],
      tables: [],
      comments: [],
      refs: [],
    });

    const insertStatements = SnowflakeExporter.exportRecords(model);
    const recordsSection = !isEmpty(insertStatements)
      ? [
          ...insertStatements,
        ]
      : [];

    const res = concat(
      statements.schemas,
      statements.tables,
      statements.comments,
      statements.refs,
      recordsSection,
    ).join('\n');
    return res;
  }
}

export default SnowflakeExporter;

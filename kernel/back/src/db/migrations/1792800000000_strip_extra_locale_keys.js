/** Fresh installs still get extra locale keys from 1738000000000_init seed
 * JSONB. Live language set is en|fr only — strip th/es/it/nl/pt from those
 * label maps without rewriting init history.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE address_countries
       SET label = label - 'th' - 'es' - 'it' - 'nl' - 'pt'
     WHERE label ?| ARRAY['th','es','it','nl','pt'];

    UPDATE delivery_networks
       SET name = name - 'th' - 'es' - 'it' - 'nl' - 'pt'
     WHERE name ?| ARRAY['th','es','it','nl','pt'];
  `);
};

exports.down = () => undefined;
